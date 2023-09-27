import { nanoid } from "nanoid/non-secure"
import { useEffect } from "react"
import useFormManagement from "../../hooks/userFormManagement"
import { useCatalogItem, useStore, useUpsertItem } from "../../store"
import { AlertMessage } from "../AlertMessage"
import { ClassificationSelector, OfficeSelector, SubClassificationSelector } from "../CommonInputFields/selectors"
import s from './itemForm.module.css'

type props = {
  itemKey?: ItemKey
}

export default function ItemForm({ itemKey }: props) {
  const item = useCatalogItem(itemKey)
  const createItem = useUpsertItem()
  const classifications = useStore(state => state.org?.classifications)
  const form = useFormManagement(initItem(item), async (item) => {
    item.classificationName = classifications?.[item.classificationId].name || ""
    item.subClassificationName = classifications?.[item.classificationId]?.subClassifications?.[item.subClassificationId]?.name || ""
    await createItem.execute(item)
  })

  const createEditText = !!item ? 'Update' : 'Create'

  function initItem(item: ItemRecord | undefined): CreateItemRecordInput {
    return ({
      recordId: item?.recordId || nanoid(8),
      officeId: item?.officeId || 'CIVA',
      itemId: item?.itemId || "",
      itemDescription: item?.itemDescription || "",
      classificationId: item?.classificationId || "",
      classificationName: item?.classificationName || "",
      subClassificationId: item?.subClassificationId || "",
      subClassificationName: item?.subClassificationName || "",
      unitOfMeasure: item?.unitOfMeasure || "",
      itemType: item?.itemType || "",
      minimumPrice: item?.minimumPrice || 0,
      markUpPercentage: item?.markUpPercentage || 0,
      unitPrice: item?.unitPrice || 0,
      status: item?.status || "active",
      linkedItems: item?.linkedItems || [],
    })
  }

  useEffect(() => {
    form.updateState(initItem(item))
  }, [item])

  return (
    <div className={s.container}>
      <AlertMessage message={createItem.error?.message} />
      <form className={s.form} onSubmit={form.onSubmit}>
        <div className={s.formGroup}>
          <ClassificationSelector className={s.fieldset} value={form.data.classificationId} onChange={form.onChange} />
          <SubClassificationSelector className={s.fieldset} value={form.data.subClassificationId} onChange={form.onChange} classification={form.data.classificationId} />
          <OfficeSelector className={s.fieldset} value={form.data.officeId} onChange={form.onChange} disabled={!!item} />
          <fieldset className={s.fieldset}>
            <label htmlFor="itemId">Item Id</label>
            <input type="text" id="itemId" name="itemId" value={form.data.itemId} onChange={form.onChange} />
          </fieldset>
        </div>
        <fieldset className={s.itemDescription}>
          <label htmlFor="itemDescription">Item Description</label>
          <input type="text" id="itemDescription" name="itemDescription" value={form.data.itemDescription} onChange={form.onChange} />
        </fieldset>
        <div className={s.formGroup}>
          <fieldset className={s.fieldset}>
            <label htmlFor="itemType">Item Type</label>
            <input type="text" id="itemType" name="itemType" value={form.data.itemType} onChange={form.onChange} />
          </fieldset>
          <fieldset className={s.fieldset}>
            <label htmlFor="unitOfMeasure">Unit of Measure</label>
            <input type="text" id="unitOfMeasure" name="unitOfMeasure" value={form.data.unitOfMeasure} onChange={form.onChange} />
          </fieldset>
        </div>
        <div className={s.formGroup}>
          <fieldset className={s.fieldset}>
            <label htmlFor="minimumPrice">Minimum Price</label>
            <input type="number" id="minimumPrice" name="minimumPrice" value={'' + form.data.minimumPrice} onChange={form.onChange} />
          </fieldset>
          <fieldset className={s.fieldset}>
            <label htmlFor="markUpPercentage">Mark Up Percentage</label>
            <input type="number" id="markUpPercentage" name="markUpPercentage" value={'' + form.data.markUpPercentage} onChange={form.onChange} />
          </fieldset>
        </div>
        <button type="submit" aria-busy={createItem.loading}>{createEditText}</button>
      </form>
    </div>
  )

}