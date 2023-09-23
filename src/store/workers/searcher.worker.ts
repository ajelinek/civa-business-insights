import Fuse from 'fuse.js'
import { removeStopwords } from 'stopword'

let searcher: Fuse<SearchItem> | null = null
let catalog: Catalogs | null = null
let id = Math.random() * 100

onmessage = (event: MessageEvent<SearcherMessage>) => {
  switch (event.data.type) {
    case 'load':
      load(event.data.payload)
      break
    case 'search':
      search(event.data.payload)
      break
  }
}

function load(catalog: Catalogs) {
  catalog = catalog
  searcher = new Fuse<SearchItem>(mergeCatalogs(catalog), {
    keys: ['searchString', 'classificationId', 'subClassificationId', 'officeId', 'itemId', 'classificationMappedTimestamp', 'itemLinkedTimestamp'],
    threshold: 0.5,
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true,
    includeScore: true,
    includeMatches: true,
    useExtendedSearch: true,
  })

  postMessage({ type: 'loaded' })
}

interface SearchItem {
  searchString: string
  classificationId: string
  subClassificationId: string
  officeId: string
  itemId: string
  classificationMappedTimestamp: Date
  itemLinkedTimestamp: Date
}

function mergeCatalogs(catalogs: Catalogs) {
  const merged = Object.values(catalogs).reduce((acc, catalog: Catalogs) => {
    acc = [
      ...acc,
      ...Object.values(catalog).map((item: ItemRecord) => ({
        searchString: `${item.classificationName} ${item.subClassificationName} ${item.itemDescription} ${item.definition}`,
        classificationId: item.classificationId,
        subClassificationId: item.subClassificationId,
        officeId: item.officeId,
        itemId: item.itemId,
        classificationMappedTimestamp: item.classificationMappedTimestamp,
        itemLinkedTimestamp: item.itemLinkedTimestamp
      }))]
    return acc
  }, [] as SearchItem[])
  return merged
}

function search(query: CatalogQuery) {
  if (!searcher) throw new Error('Searcher not initialized')

  if (!query) {
    postMessage({ type: 'searched', payload: [] })
    return
  }

  const results = searcher.search(buildLogicalQuery(query), { limit: 100 })
  const itemKeys = results
    .filter(i => {
      if (query.includeMapped === false && i.item?.classificationMappedTimestamp) return false
      if (query.includeLinked === false && i.item?.itemLinkedTimestamp) return false
      return true
    })
    .map(result => ({
      itemId: result.item.itemId,
      officeId: result.item.officeId
    }))
  const matchedCatalogs = new Set(itemKeys.map(item => item.officeId)).size
  const matchedRecords = results.length
  const keyWords = identifyKeyWords(results, query)

  postMessage({
    type: 'searched',
    payload: {
      itemKeys,
      matchedCatalogs,
      matchedRecords,
      keyWords
    }
  })
}

function identifyKeyWords(results: Fuse.FuseResult<SearchItem>[], query: CatalogQuery) {
  const tokens = new Set<string>()
  results.forEach(r => {
    r.item.searchString.split(' ')
      .filter(token => token.length > 2)
      .forEach(token => {
        tokens.add(token.toLocaleLowerCase())
      })
  })

  query.classificationNames?.forEach(name => name.split(' ').forEach(token => tokens.add(token.toLocaleLowerCase())))
  query.subClassificationNames?.forEach(name => name.split(' ').forEach(token => tokens.add(token.toLocaleLowerCase())))

  return removeStopwords(Array.from(tokens))
}

function buildLogicalQuery(query: CatalogQuery): Fuse.Expression {
  const logicalQuery = { $and: [] as Fuse.Expression[] }

  if (query.keyWords?.length || 0 > 0) {
    const autoTokens = query.keyWords?.map(token => ({ searchString: `'${token}` }))
    logicalQuery.$and.push({ $or: autoTokens })
  }

  if (query.searchText) logicalQuery.$and.push({ searchString: query.searchText })
  if (query.classificationIds?.length ?? 0 > 0) {
    const classificationIds = query.classificationIds?.map(cId => ({ classificationId: `="${cId}"` }))
    logicalQuery.$and.push({ $or: classificationIds })
  }
  if (query.subClassificationIds?.length ?? 0 > 0) {
    const subClassificationIds = query.subClassificationIds?.map(scId => ({ subClassificationId: `="${scId}"` }))
    logicalQuery.$and.push({ $or: subClassificationIds })
  }

  if (query.officeIds?.length ?? 0 > 0) {
    const officeIds = query.officeIds?.map(oId => ({ officeId: `="${oId}"` }))
    logicalQuery.$and.push({ $or: officeIds })
  }

  return logicalQuery
}
