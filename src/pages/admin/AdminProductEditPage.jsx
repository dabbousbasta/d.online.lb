import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const IMAGE_BUCKET = 'item-images'
const EXTRA_IMAGES_FOLDER = 'store-items'
const MAX_IMAGE_SIZE = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function createSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatPrice(price) {
  if (price === null || price === undefined) {
    return 'غير محدد'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(price))
}

function parseSpecifications(value) {
  try {
    const parsed = JSON.parse(value)

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function getExtension(file) {
  const fromName = file.name.split('.').pop()?.toLowerCase()

  if (fromName && ['jpg', 'jpeg', 'png', 'webp'].includes(fromName)) {
    return fromName
  }

  if (file.type === 'image/png') {
    return 'png'
  }

  if (file.type === 'image/webp') {
    return 'webp'
  }

  return 'jpg'
}

function AdminProductEditPage() {
  const navigate = useNavigate()
  const { itemId } = useParams()

  const [categories, setCategories] = useState([])
  const [product, setProduct] = useState(null)
  const [extraImages, setExtraImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingImagePath, setDeletingImagePath] = useState('')
  const [settingCoverImagePath, setSettingCoverImagePath] = useState('')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [form, setForm] = useState({
    category_id: '',
    slug: '',
    is_published: false,
    is_featured: false,
    online_price: '',
    old_price: '',
    short_description: '',
    description: '',
    specifications: '{}',
    stock_quantity: 0,
    stock_status: 'out_of_stock',
    show_when_out_of_stock: true,
    sort_order: 0,
  })

  async function loadExtraImages() {
    const folderPath = `${EXTRA_IMAGES_FOLDER}/${itemId}`

    const { data: files, error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .list(folderPath, {
        limit: 50,
        offset: 0,
        sortBy: { column: 'created_at', order: 'asc' },
      })

    if (error) {
      setErrorMessage(`تعذر تحميل الصور الإضافية: ${error.message}`)
      return
    }

    const actualFiles = (files ?? []).filter((file) => file.id)

    const imagesWithUrls = await Promise.all(
      actualFiles.map(async (file) => {
        const path = `${folderPath}/${file.name}`

        const { data, error: signedUrlError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .createSignedUrl(path, 60 * 60)

        const cacheNonce = encodeURIComponent(
          `${file.id}-${file.updated_at ?? file.created_at ?? Date.now()}`,
        )

        return {
          name: file.name,
          path,
          url: signedUrlError
            ? ''
            : `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}cacheNonce=${cacheNonce}`,
        }
      }),
    )

    setExtraImages(imagesWithUrls)
  }

  useEffect(() => {
    async function loadPage() {
      setLoading(true)
      setErrorMessage('')

      const [productResult, categoriesResult] = await Promise.all([
        supabase.rpc('get_store_admin_product', {
          target_item_id: itemId,
        }),
        supabase
          .from('store_categories')
          .select('id, name, is_active, sort_order')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
      ])

      if (productResult.error) {
        setErrorMessage(`تعذر تحميل بيانات المنتج: ${productResult.error.message}`)
        setLoading(false)
        return
      }

      if (categoriesResult.error) {
        setErrorMessage(`تعذر تحميل التصنيفات: ${categoriesResult.error.message}`)
        setLoading(false)
        return
      }

      const loadedProduct = productResult.data?.[0]

      if (!loadedProduct) {
        setErrorMessage('لم يتم العثور على هذا الصنف أو لا تملك صلاحية الوصول إليه.')
        setLoading(false)
        return
      }

      setProduct(loadedProduct)
      setCategories(categoriesResult.data ?? [])

      setForm({
        category_id: loadedProduct.category_id ?? '',
        slug: loadedProduct.store_slug ?? createSlug(loadedProduct.name),
        is_published: loadedProduct.is_published,
        is_featured: loadedProduct.is_featured,
        online_price:
          loadedProduct.online_price === null || loadedProduct.online_price === undefined
            ? ''
            : String(loadedProduct.online_price),
        old_price:
          loadedProduct.old_price === null || loadedProduct.old_price === undefined
            ? ''
            : String(loadedProduct.old_price),
        short_description: loadedProduct.short_description ?? '',
        description: loadedProduct.description ?? '',
        specifications: JSON.stringify(loadedProduct.specifications ?? {}, null, 2),
        stock_quantity: loadedProduct.stock_quantity ?? 0,
        stock_status: loadedProduct.stock_status ?? 'out_of_stock',
        show_when_out_of_stock: loadedProduct.show_when_out_of_stock ?? true,
        sort_order: loadedProduct.sort_order ?? 0,
      })

      await loadExtraImages()
      setLoading(false)
    }

    loadPage()
  }, [itemId])

  function handleChange(event) {
    const { name, value, type, checked } = event.target

    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function setSlugFromName() {
    if (!product) {
      return
    }

    setForm((current) => ({
      ...current,
      slug: createSlug(product.name),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setErrorMessage('')

    const specifications = parseSpecifications(form.specifications)

    if (!specifications) {
      setErrorMessage('المواصفات يجب أن تكون بصيغة JSON صحيحة. اتركها {} إذا لم تكن لديك مواصفات.')
      setSaving(false)
      return
    }

    const slug = createSlug(form.slug)

    if (!slug) {
      setErrorMessage('يرجى كتابة رابط مختصر للمنتج.')
      setSaving(false)
      return
    }

    const onlinePrice = form.online_price === '' ? null : Number(form.online_price)
    const oldPrice = form.old_price === '' ? null : Number(form.old_price)
    const stockQuantity = Number(form.stock_quantity)

    if (
      (onlinePrice !== null && (!Number.isFinite(onlinePrice) || onlinePrice < 0)) ||
      (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice < 0)) ||
      !Number.isInteger(stockQuantity) ||
      stockQuantity < 0
    ) {
      setErrorMessage('تحقق من الأسعار والكمية: يجب أن تكون أرقاماً صحيحة وغير سالبة.')
      setSaving(false)
      return
    }

    const displayPrice =
      onlinePrice !== null ? onlinePrice : Number(product.base_price)

    if (form.is_published && (!Number.isFinite(displayPrice) || displayPrice < 0)) {
      setErrorMessage('لا يمكن نشر منتج من دون سعر صالح. ضع سعر متجر أو تأكد من السعر الأساسي.')
      setSaving(false)
      return
    }

    if (oldPrice !== null && oldPrice <= displayPrice) {
      setErrorMessage('السعر القديم يجب أن يكون أكبر من السعر الذي سيظهر للزبون، وإلا اتركه فارغاً.')
      setSaving(false)
      return
    }

    const payload = {
      item_id: product.item_id,
      cover_image_path: product.cover_image_path ?? null,
      category_id: form.category_id || null,
      slug,
      is_published: form.is_published,
      is_featured: form.is_featured,
      online_price: onlinePrice,
      old_price: oldPrice,
      short_description: form.short_description.trim() || null,
      description: form.description.trim() || null,
      specifications,
      stock_quantity: stockQuantity,
      stock_status: form.stock_status,
      show_when_out_of_stock: form.show_when_out_of_stock,
      sort_order: Number(form.sort_order) || 0,
    }

    const { error } = await supabase
      .from('store_product_settings')
      .upsert(payload, { onConflict: 'item_id' })

    if (error) {
      const duplicateSlug = error.code === '23505'
      setErrorMessage(
        duplicateSlug
          ? 'هذا الرابط المختصر مستخدم لمنتج آخر. غيّره ثم احفظ.'
          : `تعذر حفظ إعدادات المنتج: ${error.message}`,
      )
      setSaving(false)
      return
    }

    setMessage('تم حفظ إعدادات المنتج بنجاح.')
    setSaving(false)
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files ?? [])

    if (files.length === 0) {
      return
    }

    const invalidFile = files.find(
      (file) =>
        !ALLOWED_IMAGE_TYPES.includes(file.type) ||
        file.size > MAX_IMAGE_SIZE,
    )

    if (invalidFile) {
      setErrorMessage(
        'اختر صور JPG أو PNG أو WEBP فقط، وحجم كل صورة يجب ألا يتجاوز 2 MB.',
      )
      event.target.value = ''
      return
    }

    setUploading(true)
    setMessage('')
    setErrorMessage('')

    const uploadResults = await Promise.all(
      files.map(async (file) => {
        const extension = getExtension(file)
        const safeFileName = `${crypto.randomUUID()}.${extension}`
        const path = `${EXTRA_IMAGES_FOLDER}/${itemId}/${safeFileName}`

        const { error } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(path, file, {
            cacheControl: '60',
            contentType: file.type,
            upsert: false,
          })

        return error
      }),
    )

    const failedUpload = uploadResults.find(Boolean)

    if (failedUpload) {
      setErrorMessage(`تعذر رفع إحدى الصور: ${failedUpload.message}`)
      setUploading(false)
      event.target.value = ''
      return
    }

    setMessage('تم رفع الصور الإضافية بنجاح.')
    event.target.value = ''
    await loadExtraImages()
    setUploading(false)
  }

 async function handleSetCoverImage(image) {
  if (!product || product.cover_image_path === image.path) {
    return
  }

  setSettingCoverImagePath(image.path)
  setMessage('')
  setErrorMessage('')

  const { error } = await supabase
    .from('store_product_settings')
    .update({
      cover_image_path: image.path,
    })
    .eq('item_id', product.item_id)

  if (error) {
    setErrorMessage(`تعذر تعيين صورة الغلاف: ${error.message}`)
    setSettingCoverImagePath('')
    return
  }

  setProduct((current) => ({
    ...current,
    cover_image_path: image.path,
  }))

  setMessage('تم تعيين الصورة كصورة رئيسية للمتجر.')
  setSettingCoverImagePath('')
}

  async function handleDeleteImage(image) {
    const isCurrentCover = product?.cover_image_path === image.path

    const confirmed = window.confirm(
      isCurrentCover
        ? 'هذه هي صورة الغلاف الحالية. حذفها سيعيد المنتج إلى صورته الأساسية. هل تريد المتابعة؟'
        : 'هل تريد حذف هذه الصورة الإضافية نهائياً؟ لا يمكن التراجع عن الحذف.',
    )

    if (!confirmed) {
      return
    }

    setDeletingImagePath(image.path)
    setMessage('')
    setErrorMessage('')

    if (isCurrentCover) {
      const { error: clearCoverError } = await supabase
  .from('store_product_settings')
  .update({
    cover_image_path: null,
  })
  .eq('item_id', product.item_id)
      if (clearCoverError) {
        setErrorMessage(`تعذر إزالة صورة الغلاف: ${clearCoverError.message}`)
        setDeletingImagePath('')
        return
      }

      setProduct((current) => ({
        ...current,
        cover_image_path: null,
      }))
    }

    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .remove([image.path])

    if (error) {
      setErrorMessage(`تعذر حذف الصورة: ${error.message}`)
      setDeletingImagePath('')
      return
    }

    setMessage(
      isCurrentCover
        ? 'تم حذف صورة الغلاف، وعاد المنتج لاستخدام صورته الأساسية.'
        : 'تم حذف الصورة الإضافية.',
    )

    await loadExtraImages()
    setDeletingImagePath('')
  }

  if (loading) {
    return (
      <main className="page-state">
        <p>⏳ جارٍ تحميل بيانات المنتج...</p>
      </main>
    )
  }

  if (errorMessage && !product) {
    return (
      <main className="page-state error-state">
        <h1>تعذر فتح صفحة المنتج</h1>
        <p>{errorMessage}</p>
        <button
          type="button"
          className="admin-primary-button"
          onClick={() => navigate('/admin/products')}
        >
          العودة إلى المنتجات
        </button>
      </main>
    )
  }

  return (
    <main className="admin-page" dir="rtl">
      <header className="admin-page-header admin-product-edit-header">
  <button
    type="button"
    className="text-back-button"
    onClick={() => navigate('/admin/products')}
  >
    ← العودة إلى المنتجات
  </button>

  <div className="admin-product-header-content">
    <div>
      <p className="admin-kicker">إدارة المنتج</p>
      <h1>{product.name}</h1>
      <p>
        السعر الأساسي في نظام التسعير:{' '}
        <strong>{formatPrice(product.base_price)}</strong>
      </p>
    </div>

    <button
      type="submit"
      form="admin-product-edit-form"
      className="admin-primary-button admin-top-save-button"
      disabled={saving}
    >
      {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
    </button>
  </div>
</header>

      {message ? <p className="admin-alert success-alert">{message}</p> : null}
      {errorMessage ? <p className="admin-alert error-alert">{errorMessage}</p> : null}

      <form
  id="admin-product-edit-form"
  className="admin-product-edit-form"
  onSubmit={handleSubmit}
>
        <section className="admin-form-card">
          <div className="admin-section-heading">
            <h2>الظهور والتصنيف</h2>
          </div>

          <div className="admin-form-grid">
            <label className="checkbox-field">
              <input
                name="is_published"
                type="checkbox"
                checked={form.is_published}
                onChange={handleChange}
              />
              إظهار المنتج في المتجر
            </label>

            <label className="checkbox-field">
              <input
                name="is_featured"
                type="checkbox"
                checked={form.is_featured}
                onChange={handleChange}
              />
              منتج مميز
            </label>

            <label>
              تصنيف المتجر
              <select
                name="category_id"
                value={form.category_id}
                onChange={handleChange}
              >
                <option value="">بدون تصنيف</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.is_active ? '' : ' (مخفي)'}
                  </option>
                ))}
              </select>
            </label>

            <label>
              ترتيب العرض
              <input
                name="sort_order"
                type="number"
                min="0"
                value={form.sort_order}
                onChange={handleChange}
              />
            </label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-section-heading">
            <h2>الرابط والأسعار</h2>
          </div>

          <div className="admin-form-grid">
            <label className="full-width-field">
              رابط المنتج المختصر
              <div className="input-with-button">
                <input
                  name="slug"
                  value={form.slug}
                  onChange={handleChange}
                  dir="ltr"
                  required
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={setSlugFromName}
                >
                  توليد من الاسم
                </button>
              </div>
              <small className="field-helper">
                مثال للرابط لاحقاً: /product/{form.slug || 'اسم-المنتج'}
              </small>
            </label>

            <label>
              سعر المتجر الخاص بالدولار
              <input
                name="online_price"
                type="number"
                min="0"
                step="0.01"
                value={form.online_price}
                onChange={handleChange}
                placeholder={`اتركه فارغاً لاستخدام ${formatPrice(product.base_price)}`}
              />
              <small className="field-helper">
                هذا السعر يظهر للمتجر فقط ولا يغير السعر الأساسي.
              </small>
            </label>

            <label>
              السعر القديم بالدولار
              <input
                name="old_price"
                type="number"
                min="0"
                step="0.01"
                value={form.old_price}
                onChange={handleChange}
                placeholder="اختياري للعروض فقط"
              />
              <small className="field-helper">
                لا يظهر إلا إذا كان أعلى من السعر الظاهر للزبون.
              </small>
            </label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-section-heading">
            <h2>الوصف والمواصفات</h2>
          </div>

          <div className="admin-form-grid">
            <label className="full-width-field">
              وصف قصير
              <textarea
                name="short_description"
                value={form.short_description}
                onChange={handleChange}
                rows="3"
                placeholder="وصف مختصر يظهر في بطاقة المنتج"
              />
            </label>

            <label className="full-width-field">
              الوصف التفصيلي
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows="6"
                placeholder="وصف كامل يظهر في صفحة تفاصيل المنتج لاحقاً"
              />
            </label>

            <label className="full-width-field">
              المواصفات بصيغة JSON
              <textarea
                name="specifications"
                value={form.specifications}
                onChange={handleChange}
                rows="9"
                dir="ltr"
                className="json-textarea"
              />
              <small className="field-helper">
                مثال: {`{"القدرة":"3 HP","الجهد":"380V"}`} — اتركها {`{}`} إذا لم تكن لديك مواصفات.
              </small>
            </label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-section-heading">
            <h2>المخزون</h2>
          </div>

          <div className="admin-form-grid">
            <label>
              الكمية الحالية
              <input
                name="stock_quantity"
                type="number"
                min="0"
                step="1"
                value={form.stock_quantity}
                onChange={handleChange}
              />
            </label>

            <label>
              حالة المخزون
              <select
                name="stock_status"
                value={form.stock_status}
                onChange={handleChange}
              >
                <option value="in_stock">متوفر</option>
                <option value="low_stock">كمية محدودة</option>
                <option value="out_of_stock">غير متوفر</option>
              </select>
            </label>

            <label className="checkbox-field">
              <input
                name="show_when_out_of_stock"
                type="checkbox"
                checked={form.show_when_out_of_stock}
                onChange={handleChange}
              />
              أبقِ المنتج ظاهراً عند نفاد الكمية
            </label>
          </div>
        </section>

        <section className="admin-form-card">
          <div className="admin-section-heading">
            <h2>صور إضافية للمنتج</h2>
            <span className="count-chip">{extraImages.length}</span>
          </div>

          <p className="field-helper image-upload-helper">
            تُحفظ الصور الجديدة في مسار خاص بالمتجر، ولا تغيّر الصورة الأساسية أو صور نظام التسعير.
            الصيغ المسموحة: JPG وPNG وWEBP، وحجم كل صورة حتى 2 MB.
          </p>

          <label className="image-upload-input">
            <span>{uploading ? 'جارٍ رفع الصور...' : 'اختر صوراً إضافية من الجهاز'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>

          {extraImages.length === 0 ? (
            <p className="admin-empty extra-images-empty">
              لا توجد صور إضافية لهذا المنتج بعد.
            </p>
          ) : (
            <div className="extra-images-grid">
              {extraImages.map((image) => {
                const isCurrentCover = product.cover_image_path === image.path
                const isSettingCover = settingCoverImagePath === image.path
                const isDeleting = deletingImagePath === image.path

                return (
                  <article
                    className={`extra-image-card ${isCurrentCover ? 'is-cover-image' : ''}`}
                    key={image.path}
                  >
                    {image.url ? (
                      <img src={image.url} alt={`صورة إضافية لـ ${product.name}`} />
                    ) : (
                      <div className="extra-image-fallback">تعذر معاينة الصورة</div>
                    )}

                    {isCurrentCover ? (
                      <p className="cover-image-badge">صورة الغلاف الحالية</p>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button extra-image-cover-button"
                        disabled={isSettingCover || isDeleting}
                        onClick={() => handleSetCoverImage(image)}
                      >
                        {isSettingCover ? 'جارٍ التعيين...' : 'استخدام كصورة رئيسية للمتجر'}
                      </button>
                    )}

                    <button
                      type="button"
                      className="table-delete-button extra-image-delete-button"
                      disabled={isDeleting || isSettingCover}
                      onClick={() => handleDeleteImage(image)}
                    >
                      {isDeleting ? 'جارٍ الحذف...' : 'حذف الصورة'}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <div className="admin-save-bar">
          <button type="submit" className="admin-primary-button" disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات المنتج'}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate('/admin/products')}
          >
            إلغاء والعودة
          </button>
        </div>
      </form>
    </main>
  )
}

export default AdminProductEditPage