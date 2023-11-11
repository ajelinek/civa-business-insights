import Papa from "papaparse"
import { offices } from "../const"
import { createCatalog, fetchCatalog } from "./catalog"
import { itemRecordId } from "../selectors/item"
import { nanoid } from "nanoid"
import { addItemKeyToLinkedItems, multipleItemLink } from "./items"

export async function processImportFile(options: importFileOptions, email: string) {
  if (!options.inventoryFile) throw new Error('No inventory file provided')
  if (!options.pricingFile) throw new Error('No pricing file provided')
  const meta: OfficeCatalogMetadata = {
    lastImportDate: new Date(),
    inventoryItemsImported: 0,
    pricingItemsImported: 0,
    matchedPricingItems: 0,
    unmatchedPricingItems: [],
    erroredPricingItems: [],
    multiplePricingInfoItems: [],
    numberOfItemsLinkedToMaster: 0
  }

  /****************************************************/
  /* 1. Convert the inventory file to a JSON object    */
  /****************************************************/
  const inventoryAsJSON = await convertFileToJSON(options.inventoryFile) as ImportRecord[]
  meta.inventoryItemsImported = inventoryAsJSON.length
  const { catalog, officeId } = convertImportFileToCatalog(inventoryAsJSON)
  if (!officeId) throw new Error('No office found')
  if (!catalog) throw new Error('No catalog created')


  /****************************************************/
  /* 2. Convert the pricing file to a JSON object      */
  /****************************************************/
  const priceAsJSON = await convertFileToJSON(options.pricingFile) as PriceRecordRaw[]


  /****************************************************/
  /* 3. Merge the pricing data with the inventory data */
  /****************************************************/
  priceAsJSON.forEach((record) => {
    if (!record.itemId) return
    meta.pricingItemsImported++

    try {
      const priceDataList = convertImportPriceRecordToPriceRecord(record)
      if (priceDataList.length > 1) meta.multiplePricingInfoItems.push(record.itemId)
      const pricing = priceDataList[0]
      const priceItemId = itemRecordId({ itemId: record.itemId, officeId })

      if (!catalog[priceItemId]) {
        meta.unmatchedPricingItems.push(record.itemId)
        return
      }

      catalog[priceItemId] = { ...catalog[priceItemId], ...pricing }
      meta.matchedPricingItems++
    } catch (error) {
      console.error(record)
      meta.erroredPricingItems.push(record.itemId)
    }
  })


  /****************************************************/
  /* 4. If creating master catalog, convert and return*/
  /****************************************************/
  if (options.masterCatalog) {
    await createCatalog('CIVA', convertToMasterCatalog(catalog))
    return { meta }
  }


  /****************************************************/
  /* 5. Link items to master catalog                  */
  /****************************************************/
  const autoLinkItems: LinkedItemUpdate[] = []
  const masterCatalog = await fetchCatalog('CIVA')
  Object.keys(catalog).forEach((key) => {
    const itemRecord = catalog[key]
    const masterItemRecord = searchMasterCatalog(masterCatalog, itemRecord)

    if (masterItemRecord) {
      autoLinkItems.push({
        linkedItems: addItemKeyToLinkedItems(masterItemRecord.linkedItems || [], [{ officeId, recordId: itemRecord.recordId }]),
        linkTo: { officeId: masterItemRecord.officeId, recordId: masterItemRecord.recordId }
      })

      itemRecord.itemLinkedTo = { officeId: 'CIVA', recordId: masterItemRecord.recordId }
    }
  })

  /***************************************************************/
  /* 6. Create catalog in DB & Update Master Catalog LinkedItems */
  /***************************************************************/
  await createCatalog(officeId, catalog)
  meta.numberOfItemsLinkedToMaster = autoLinkItems.length
  await multipleItemLink(autoLinkItems)

  return { meta }
}

function searchMasterCatalog(catalog: Catalog, itemRecord: ItemRecord) {
  const matchedMasterItemKey = Object.keys(catalog).find((key) => {
    const masterItemRecord = catalog[key]
    return (
      masterItemRecord.itemDescription === itemRecord.itemDescription ||
      masterItemRecord.itemId === itemRecord.itemId ||
      masterItemRecord.linkedItems?.find((itemKey) => (
        itemKey.recordId === itemRecord.recordId &&
        itemKey.officeId === itemRecord.officeId)
      )
    )
  })
  return matchedMasterItemKey ? catalog[matchedMasterItemKey] : null
}


function convertToMasterCatalog(catalog: Record<string, ItemRecord>) {
  return Object.keys(catalog).reduce((acc, key) => {
    const itemRecord = catalog[key]
    const newItemRecord = {
      ...itemRecord,
      recordId: nanoid(8),
      officeId: 'CIVA',
      linkedItems: [{
        recordId: itemRecord.recordId,
        officeId: itemRecord.officeId
      }]
    } as ItemRecord
    acc[newItemRecord.recordId] = newItemRecord
    return acc
  }, {} as Catalog)
}



function convertFileToJSON(file: File): Promise<ImportRecord[]> | Promise<PriceRecordRaw[]> {
  //@ts-ignore
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      // preview: 10,

      transformHeader(header: string) {
        return nameMap.get(header) || header
      },
      complete: (results) => {
        resolve(results.data as ImportRecord[] | PriceRecordRaw[])
      },
      error: (error) => {
        console.log(error)
        reject(new Error('There was an error parsing the file: ' + error.message))
      }
    })
  })
}

function convertImportFileToCatalog(records: ImportRecord[]) {
  const officeId = convertImportRecordToItemRecord(records[0]).officeId
  const catalog = records.reduce((acc, record) => {
    if (!record.itemId) return acc
    const itemRecord = convertImportRecordToItemRecord(record)
    acc[itemRecord.recordId] = itemRecord
    return acc
  }, {} as Record<string, ItemRecord>)

  return { catalog, officeId }
}

function convertImportRecordToItemRecord(importRecord: ImportRecord): ItemRecord {
  const itemRecord = {
    itemId: importRecord.itemId,
    classificationId: importRecord.classificationId,
    classificationName: importRecord.description,
    subClassificationId: importRecord.subClassificationId,
    subClassificationName: importRecord.description_1,
    itemDescription: importRecord.description_2,
    definition: importRecord.invoiceDescription,
    itemType: importRecord.itemType,
    itemTypeDescription: importRecord.description_3 === '[None]' ? '' : importRecord.description_3,
    unitPrice: parseFloat(importRecord.quantityUnitPrice),
    dispensingFee: parseFloat(importRecord.dispensingFee),
    minimumPrice: parseFloat(importRecord.minimumPrice),
    markUpPercentage: 0,
  } as ItemRecord

  const officeKeys = Object.keys(offices) as OfficeId[]
  const officeId = officeKeys.find(
    (key) => offices[key]?.name?.toLocaleLowerCase() === importRecord.locationName?.toLocaleLowerCase()
  ) //Hacky, but we know it will be there, .. or hope
  if (!officeId) throw new Error('No office found')
  itemRecord.officeId = officeId
  itemRecord.recordId = itemRecordId(itemRecord)

  return itemRecord
}

function convertImportPriceRecordToPriceRecord(record: PriceRecordRaw): PriceRecord[] {
  const priceString = record?.eval_key?.replace(/(\w+)(=)([^,}\s]+)/g, '"$1":"$3"')
  const priceDataList = JSON.parse(priceString)
  return priceDataList.map((priceData: any) => {
    return {
      itemId: record.itemId,
      unitPrice: priceData.quanitytunitprice === 'null' ? 0 : parseFloat(priceData.quanitytunitprice),
      markUpPercentage: priceData.markup === 'null' ? 0 : parseFloat(priceData.markup),
    }
  })
}

const nameMap = new Map<string, string>([
  ['classid', 'classificationId'],
  // ['description', 'classificationDescription'],
  ['subclassid', 'subClassificationId'],
  // ['description_1', 'subClassificationDescription'],
  ['invoiceitemid', 'itemId'],
  // ['description_2', 'itemDescription'],
  ['invoicedescription', 'invoiceDescription'],
  ['itemtype', 'itemType'],
  // ['description_3', 'itemTypeDescription'],
  ['quantityfrom', 'quantityFrom'],
  ['quanitytunitprice', 'quantityUnitPrice'],
  ['dispensingfee', 'dispensingFee'],
  ['minimumprice', 'minimumPrice'],
  ['markup', 'markUpPercentage'],
  ['qualityunityprice', 'unitPrice'],
  ['qualityfrom', 'quantityFrom'],
  ['name1', 'locationName'],
  ['revenue_id', 'revenueId'],
  ['allow_price_chg', 'allowPriceChange'],
  ['nbr_disp', 'numberOfDisp'],
  ['status', 'status']
])

