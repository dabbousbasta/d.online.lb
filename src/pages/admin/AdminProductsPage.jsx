import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const PAGE_SIZE = 50
const FILTER_STORAGE_KEY = 'dabous-admin-products-filter'
const RECENT_SEARCHES_STORAGE_KEY = 'dabous-admin-products-recent-searches'
const MAX_RECENT_SEARCHES = 5

const FILTER_TABS = [
  { id: 'all', label: 'كل الأصناف' },
  { id: 'published', label: 'المعروضة أونلاين' },
  { id: 'in_stock', label: 'المتوفرة' },
  { id: 'out_of_stock', label: 'غير المتوفرة' },
  { id: 'low_stock', label: 'الكمية المحدودة' },
]

const STOCK_OPTIONS = [
  { id: 'in_stock', label: 'متوفر' },
  { id: 'low_stock', label: 'كمية محدودة' },
  { id: 'out_of_stock', label: 'غير متوفر' },
]
const PRICE_FILTER_OPTIONS = [
  { id: 'all', label: 'كل حالات السعر' },
  { id: 'priced', label: 'مسعّر' },
  { id: 'unpriced', label: 'غير مسعّر' },
  { id: 'store_price', label: 'له سعر متجر خاص' },
  { id: 'base_price', label: 'يعتمد السعر الأساسي' },
]

const VISIBILITY_FILTER_OPTIONS = [
  { id: 'all', label: 'كل حالات العرض' },
  { id: 'published', label: 'معروض أونلاين' },
  { id: 'hidden', label: 'غير معروض أونلاين' },
]

const STOCK_FILTER_OPTIONS = [
  { id: 'all', label: 'كل حالات المخزون' },
  { id: 'in_stock', label: 'متوفر' },
  { id: 'low_stock', label: 'كمية محدودة' },
  { id: 'out_of_stock', label: 'غير متوفر' },
]

function formatPrice(price) {
  if (price === null || price === undefined) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(price))
}

function createSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getImagePath(imagePath) {
  return String(imagePath ?? '')
    .trim()
    .replace(/^item-images\//, '')
    .replace(/^\/+/, '')
}

async function getImageUrl(imagePath) {
  const normalizedPath = getImagePath(imagePath)

  if (!normalizedPath) {
    return ''
  }

  const { data, error } = await supabase.storage
    .from('item-images')
    .createSignedUrl(normalizedPath, 60 * 60)

  return error ? '' : data.signedUrl
}

function getSavedFilter() {
  const defaultFilter = {
    searchText: '',
    filterMode: 'all',
    categoryFilterId: '',
    priceFilter: 'all',
    visibilityFilter: 'all',
    stockFilter: 'all',
  }

  try {
    const savedValue = window.localStorage.getItem(FILTER_STORAGE_KEY)

    if (!savedValue) {
      return defaultFilter
    }

    const parsedValue = JSON.parse(savedValue)

    return {
      searchText: String(parsedValue?.searchText ?? ''),
      filterMode: FILTER_TABS.some(
        (tab) => tab.id === parsedValue?.filterMode,
      )
        ? parsedValue.filterMode
        : 'all',
      categoryFilterId: String(parsedValue?.categoryFilterId ?? ''),
      priceFilter: PRICE_FILTER_OPTIONS.some(
        (option) => option.id === parsedValue?.priceFilter,
      )
        ? parsedValue.priceFilter
        : 'all',
      visibilityFilter: VISIBILITY_FILTER_OPTIONS.some(
        (option) => option.id === parsedValue?.visibilityFilter,
      )
        ? parsedValue.visibilityFilter
        : 'all',
      stockFilter: STOCK_FILTER_OPTIONS.some(
        (option) => option.id === parsedValue?.stockFilter,
      )
        ? parsedValue.stockFilter
        : 'all',
    }
  } catch {
    return defaultFilter
  }
}

function getRecentSearches() {
  try {
    const savedValue = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)
    const parsedValue = JSON.parse(savedValue ?? '[]')

    return Array.isArray(parsedValue)
      ? parsedValue
          .filter(
            (item) =>
              item &&
              typeof item.searchText === 'string' &&
              typeof item.filterMode === 'string',
          )
          .slice(0, MAX_RECENT_SEARCHES)
      : []
  } catch {
    return []
  }
}

function getFilterLabel(filterMode) {
  return FILTER_TABS.find((tab) => tab.id === filterMode)?.label ?? 'كل الأصناف'
}

function getStockLabel(stockStatus) {
  return STOCK_OPTIONS.find((option) => option.id === stockStatus)?.label ?? 'غير متوفر'
}

function getInitialQuickEdit(product) {
  return {
    isPublished: Boolean(product.is_published),
    onlinePrice:
      product.online_price === null || product.online_price === undefined
        ? ''
        : String(product.online_price),
    categoryId: product.category_id ?? '',
    stockQuantity: String(product.stock_quantity ?? 0),
    stockStatus: product.stock_status ?? 'out_of_stock',
  }
}

function getEditSignature(edit) {
  return JSON.stringify({
    isPublished: Boolean(edit.isPublished),
    onlinePrice: String(edit.onlinePrice ?? '').trim(),
    categoryId: edit.categoryId || '',
    stockQuantity: String(edit.stockQuantity ?? '').trim(),
    stockStatus: edit.stockStatus || 'out_of_stock',
  })
}

function AdminProductsPage() {
  const navigate = useNavigate()
  const initialFilter = useRef(getSavedFilter()).current

  const [searchInput, setSearchInput] = useState(initialFilter.searchText)
  const [searchText, setSearchText] = useState(initialFilter.searchText)
  const [filterMode, setFilterMode] = useState(initialFilter.filterMode)
  const [categoryFilterId, setCategoryFilterId] = useState(
  initialFilter.categoryFilterId,
)
const [priceFilter, setPriceFilter] = useState(initialFilter.priceFilter)
const [visibilityFilter, setVisibilityFilter] = useState(
  initialFilter.visibilityFilter,
)
const [stockFilter, setStockFilter] = useState(initialFilter.stockFilter)
  const [recentSearches, setRecentSearches] = useState(getRecentSearches)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [quickEdits, setQuickEdits] = useState({})
  const [originalEdits, setOriginalEdits] = useState({})
  const [savingIds, setSavingIds] = useState([])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [rowMessages, setRowMessages] = useState({})
  const [bulkMessage, setBulkMessage] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    setBulkMessage('')

    const [productsResult, categoriesResult] = await Promise.all([
      supabase.rpc('get_store_admin_products', {
  search_text: searchText.trim() || null,
  filter_mode: filterMode,
  category_filter_id: categoryFilterId || null,
  price_filter: priceFilter,
  visibility_filter: visibilityFilter,
  stock_filter: stockFilter,
  page_limit: PAGE_SIZE,
  page_offset: page * PAGE_SIZE,
}),
      supabase
        .from('store_categories')
        .select('id, name, is_active, sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ])

    if (productsResult.error) {
      setErrorMessage(`تعذر تحميل المنتجات: ${productsResult.error.message}`)
      setLoading(false)
      return
    }

    if (categoriesResult.error) {
      setErrorMessage(`تعذر تحميل التصنيفات: ${categoriesResult.error.message}`)
      setLoading(false)
      return
    }

    const productsWithImages = await Promise.all(
      (productsResult.data ?? []).map(async (product) => ({
        ...product,
        imageUrl: await getImageUrl(
          product.cover_image_path || product.image_path,
        ),
      })),
    )

    const initialEdits = Object.fromEntries(
      productsWithImages.map((product) => [
        product.item_id,
        getInitialQuickEdit(product),
      ]),
    )

    setProducts(productsWithImages)
    setCategories(categoriesResult.data ?? [])
    setQuickEdits(initialEdits)
    setOriginalEdits(initialEdits)
    setSavingIds([])
    setRowMessages({})
    setTotalCount(Number(productsResult.data?.[0]?.total_count ?? 0))
    setLoading(false)
  }, [
  categoryFilterId,
  filterMode,
  page,
  priceFilter,
  searchText,
  stockFilter,
  visibilityFilter,
])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
  searchText,
  filterMode,
  categoryFilterId,
  priceFilter,
  visibilityFilter,
  stockFilter,
}),
    )
  }, [
  categoryFilterId,
  filterMode,
  priceFilter,
  searchText,
  stockFilter,
  visibilityFilter,
])

  function saveRecentSearch(nextSearchText, nextFilterMode) {
    const searchValue = nextSearchText.trim()

    if (!searchValue && nextFilterMode === 'all') {
      return
    }

    const nextEntry = {
      searchText: searchValue,
      filterMode: nextFilterMode,
    }

    setRecentSearches((currentSearches) => {
      const updatedSearches = [
        nextEntry,
        ...currentSearches.filter(
          (item) =>
            !(
              item.searchText === nextEntry.searchText &&
              item.filterMode === nextEntry.filterMode
            ),
        ),
      ].slice(0, MAX_RECENT_SEARCHES)

      window.localStorage.setItem(
        RECENT_SEARCHES_STORAGE_KEY,
        JSON.stringify(updatedSearches),
      )

      return updatedSearches
    })
  }

  function applyFilter(nextSearchText, nextFilterMode) {
    setSearchInput(nextSearchText)
    setSearchText(nextSearchText)
    setFilterMode(nextFilterMode)
    setPage(0)
    saveRecentSearch(nextSearchText, nextFilterMode)
  }

  function updateQuickEdit(itemId, field, value) {
    setQuickEdits((currentEdits) => ({
      ...currentEdits,
      [itemId]: {
        ...currentEdits[itemId],
        [field]: value,
      },
    }))

    setRowMessages((currentMessages) => ({
      ...currentMessages,
      [itemId]: '',
    }))

    setBulkMessage('')
  }

  function isChanged(itemId) {
    const currentEdit = quickEdits[itemId]
    const originalEdit = originalEdits[itemId]

    return (
      currentEdit &&
      originalEdit &&
      getEditSignature(currentEdit) !== getEditSignature(originalEdit)
    )
  }

  function getChangedProducts() {
    return products.filter((product) => isChanged(product.item_id))
  }

  function validateAndBuildPayload(product) {
    const quickEdit =
      quickEdits[product.item_id] ?? getInitialQuickEdit(product)

    const onlinePriceText = String(quickEdit.onlinePrice ?? '').trim()
    const onlinePrice =
      onlinePriceText === '' ? null : Number(onlinePriceText)

    const stockQuantity = Number(quickEdit.stockQuantity)

    if (
      onlinePrice !== null &&
      (!Number.isFinite(onlinePrice) || onlinePrice < 0)
    ) {
      return {
        error: 'أدخل سعر متجر صحيحاً أو اتركه فارغاً لاستخدام السعر الأساسي.',
      }
    }

    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return {
        error: 'الكمية يجب أن تكون رقماً صحيحاً يساوي صفراً أو أكبر.',
      }
    }

    const effectivePrice =
      onlinePrice !== null ? onlinePrice : Number(product.base_price)

    if (
      quickEdit.isPublished &&
      (!Number.isFinite(effectivePrice) || effectivePrice < 0)
    ) {
      return {
        error: 'لا يمكن عرض الصنف أونلاين من دون سعر صالح.',
      }
    }

    return {
      edit: quickEdit,
      payload: {
        item_id: product.item_id,
        cover_image_path: product.cover_image_path ?? null,
        category_id: quickEdit.categoryId || null,
        slug: product.slug || createSlug(product.name),
        is_published: Boolean(quickEdit.isPublished),
        online_price: onlinePrice,
        old_price: null,
        stock_quantity: stockQuantity,
        stock_status: quickEdit.stockStatus || 'out_of_stock',
        show_when_out_of_stock: true,
        sort_order: 0,
      },
    }
  }

  async function saveProduct(product) {
    const validation = validateAndBuildPayload(product)

    if (validation.error) {
      setRowMessages((currentMessages) => ({
        ...currentMessages,
        [product.item_id]: { type: 'error', text: validation.error },
      }))
      return false
    }

    setSavingIds((currentIds) => [...currentIds, product.item_id])

    const { error } = await supabase
      .from('store_product_settings')
      .upsert(validation.payload, { onConflict: 'item_id' })

    setSavingIds((currentIds) =>
      currentIds.filter((itemId) => itemId !== product.item_id),
    )

    if (error) {
      setRowMessages((currentMessages) => ({
        ...currentMessages,
        [product.item_id]: {
          type: 'error',
          text: `تعذر الحفظ: ${error.message}`,
        },
      }))
      return false
    }

    const savedEdit = {
      ...validation.edit,
      onlinePrice:
        validation.payload.online_price === null
          ? ''
          : String(validation.payload.online_price),
      categoryId: validation.payload.category_id ?? '',
      stockQuantity: String(validation.payload.stock_quantity),
      stockStatus: validation.payload.stock_status,
      isPublished: validation.payload.is_published,
    }

    setProducts((currentProducts) =>
      currentProducts.map((currentProduct) =>
        currentProduct.item_id === product.item_id
          ? {
              ...currentProduct,
              category_id: validation.payload.category_id,
              category_name:
                categories.find(
                  (category) => category.id === validation.payload.category_id,
                )?.name ?? null,
              is_published: validation.payload.is_published,
              online_price: validation.payload.online_price,
              stock_quantity: validation.payload.stock_quantity,
              stock_status: validation.payload.stock_status,
              slug: validation.payload.slug,
            }
          : currentProduct,
      ),
    )

    setQuickEdits((currentEdits) => ({
      ...currentEdits,
      [product.item_id]: savedEdit,
    }))

    setOriginalEdits((currentEdits) => ({
      ...currentEdits,
      [product.item_id]: savedEdit,
    }))

    setRowMessages((currentMessages) => ({
      ...currentMessages,
      [product.item_id]: {
        type: 'success',
        text: 'تم حفظ هذا الصنف بنجاح.',
      },
    }))

    return true
  }

  async function handleSaveRow(product) {
    setBulkMessage('')
    await saveProduct(product)
  }

  async function handleBulkSave() {
    const changedProducts = getChangedProducts()

    if (changedProducts.length === 0) {
      setBulkMessage('لا توجد تعديلات جديدة للحفظ في هذه الصفحة.')
      return
    }

    setBulkSaving(true)
    setBulkMessage('')
    setRowMessages({})

    const results = await Promise.all(
      changedProducts.map((product) => saveProduct(product)),
    )

    const successCount = results.filter(Boolean).length
    const failedCount = results.length - successCount

    setBulkMessage(
      failedCount === 0
        ? `تم حفظ ${successCount} صنفاً بنجاح.`
        : `تم حفظ ${successCount} صنفاً، وتعذر حفظ ${failedCount} صنفاً. راجع رسائل الصفوف.`,
    )

    setBulkSaving(false)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const canGoPrevious = page > 0
  const canGoNext = page + 1 < totalPages
 const hasActiveFilter =
  Boolean(searchText.trim()) ||
  filterMode !== 'all' ||
  categoryFilterId !== '' ||
  priceFilter !== 'all' ||
  visibilityFilter !== 'all' ||
  stockFilter !== 'all'
  const changedProductsCount = getChangedProducts().length

  return (
    <main className="admin-page" dir="rtl">
      <header className="admin-page-header">
        <button
          type="button"
          className="text-back-button"
          onClick={() => navigate('/admin')}
        >
          ← العودة إلى لوحة الإدارة
        </button>

        <p className="admin-kicker">إدارة المتجر</p>
        <h1>المنتجات</h1>
        <p>
          ابحث عن الأصناف وعدّل العرض والسعر والتصنيف والمخزون مباشرة، ثم احفظ
          صفاً واحداً أو كل التعديلات دفعة واحدة.
        </p>
      </header>

      <section className="admin-search-card">
        <form
          className="product-search-form"
          onSubmit={(event) => {
            event.preventDefault()
            applyFilter(searchInput, filterMode)
          }}
        >
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ابحث بكلمات بأي ترتيب، مثل: 380v leo أو دوش خلاط"
            aria-label="البحث عن منتج"
          />

          <button type="submit" className="admin-primary-button">
            بحث
          </button>

          {hasActiveFilter ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
  setSearchInput('')
  setSearchText('')
  setFilterMode('all')
  setCategoryFilterId('')
  setPriceFilter('all')
  setVisibilityFilter('all')
  setStockFilter('all')
  setPage(0)
}}
            >
              مسح الفلتر
            </button>
          ) : null}
        </form>

        <p className="search-helper-text">
          مثال: كتابة <strong>دوش خلاط</strong> ستجد صنف <strong>خلاط دوش</strong>.
        </p>

        <div
          className="admin-product-filter-tabs"
          role="tablist"
          aria-label="فلترة المنتجات"
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filterMode === tab.id}
              className={
                filterMode === tab.id
                  ? 'admin-filter-tab active'
                  : 'admin-filter-tab'
              }
              onClick={() => applyFilter(searchInput, tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="admin-advanced-product-filters">
  <label>
    <span>تصنيف الصنف</span>
    <select
      value={categoryFilterId}
      onChange={(event) => {
        setCategoryFilterId(event.target.value)
        setPage(0)
      }}
    >
      <option value="">كل التصنيفات</option>
            {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
          {category.is_active ? '' : ' (مخفي)'}
        </option>
      ))}
    </select>
  </label>

  <label>
    <span>التسعير</span>
    <select
      value={priceFilter}
      onChange={(event) => {
        setPriceFilter(event.target.value)
        setPage(0)
      }}
    >
      {PRICE_FILTER_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  </label>

  <label>
    <span>العرض أونلاين</span>
    <select
      value={visibilityFilter}
      onChange={(event) => {
        setVisibilityFilter(event.target.value)
        setPage(0)
      }}
    >
      {VISIBILITY_FILTER_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  </label>

  <label>
    <span>حالة المخزون</span>
    <select
      value={stockFilter}
      onChange={(event) => {
        setStockFilter(event.target.value)
        setPage(0)
      }}
    >
      {STOCK_FILTER_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
</div>

        {recentSearches.length > 0 ? (
          <div className="recent-admin-searches">
            <span>آخر 5 فلاتر:</span>

            <div>
              {recentSearches.map((recentSearch, index) => (
                <button
                  key={`${recentSearch.searchText}-${recentSearch.filterMode}-${index}`}
                  type="button"
                  className="recent-admin-search-button"
                  onClick={() =>
                    applyFilter(
                      recentSearch.searchText,
                      recentSearch.filterMode,
                    )
                  }
                >
                  {recentSearch.searchText
                    ? `${recentSearch.searchText} — ${getFilterLabel(recentSearch.filterMode)}`
                    : getFilterLabel(recentSearch.filterMode)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <p className="admin-alert error-alert">{errorMessage}</p>
      ) : null}

      <section className="admin-list-card">
        <div className="admin-section-heading admin-products-heading">
          <div>
            <h2>نتائج الأصناف</h2>
            <p className="admin-results-filter-note">
              الفلتر الحالي: {getFilterLabel(filterMode)}
              {searchText.trim() ? ` — البحث: ${searchText.trim()}` : ''}
            </p>
          </div>

          <div className="admin-bulk-save-area">
            <span className="count-chip">{totalCount}</span>

            <button
              type="button"
              className="admin-primary-button bulk-save-button"
              disabled={bulkSaving || loading || changedProductsCount === 0}
              onClick={handleBulkSave}
            >
              {bulkSaving
                ? 'جارٍ حفظ التعديلات...'
                : `حفظ كل التعديلات (${changedProductsCount})`}
            </button>
          </div>
        </div>

        {bulkMessage ? (
          <p className="bulk-save-message" role="status">
            {bulkMessage}
          </p>
        ) : null}

        {loading ? (
          <p className="admin-loading">جارٍ تحميل الأصناف...</p>
        ) : products.length === 0 ? (
          <p className="admin-empty">
            لم نجد أصنافاً مطابقة للبحث أو للفلتر المحدد.
          </p>
        ) : (
          <>
            <div className="admin-products-list">
              {products.map((product) => {
                const quickEdit =
                  quickEdits[product.item_id] ?? getInitialQuickEdit(product)

                const rowMessage = rowMessages[product.item_id]
                const isSaving = savingIds.includes(product.item_id)
                const hasChanges = isChanged(product.item_id)

                return (
                  <article
                    className={
                      hasChanges
                        ? 'admin-product-row has-unsaved-changes'
                        : 'admin-product-row'
                    }
                    key={product.item_id}
                  >
                    <div className="admin-product-thumb">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} />
                      ) : (
                        <img
                          src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/logo.png`}
                          alt={`شعار دبوس اونلاين — ${product.name}`}
                          className="admin-product-thumb-fallback"
                        />
                      )}
                    </div>

                    <div className="admin-product-main">
                      <div className="admin-product-title-line">
                        <h3>{product.name}</h3>

                        <span
                          className={
                            product.is_published
                              ? 'status-pill active'
                              : 'status-pill hidden'
                          }
                        >
                          {product.is_published ? 'معروض أونلاين' : 'غير معروض'}
                        </span>
                      </div>

                      <div className="admin-product-meta">
                        <span>السعر الأساسي: {formatPrice(product.base_price)}</span>
                        <span>
                          {product.online_price !== null
                            ? `سعر المتجر الحالي: ${formatPrice(product.online_price)}`
                            : 'سعر المتجر: السعر الأساسي'}
                        </span>
                        <span>
                          التصنيف الحالي: {product.category_name || 'بدون تصنيف'}
                        </span>
                        <span>
                          المخزون الحالي: {getStockLabel(product.stock_status)}
                        </span>
                        <span>الكمية الحالية: {product.stock_quantity}</span>
                      </div>

                      <div className="quick-product-edit quick-product-edit-expanded">
                        <label className="quick-publish-field">
                          <input
                            type="checkbox"
                            checked={quickEdit.isPublished}
                            disabled={isSaving || bulkSaving}
                            onChange={(event) =>
                              updateQuickEdit(
                                product.item_id,
                                'isPublished',
                                event.target.checked,
                              )
                            }
                          />
                          <span>عرض أونلاين</span>
                        </label>

                        <label className="quick-price-field">
                          <span>سعر المتجر $</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={quickEdit.onlinePrice}
                            disabled={isSaving || bulkSaving}
                            onChange={(event) =>
                              updateQuickEdit(
                                product.item_id,
                                'onlinePrice',
                                event.target.value,
                              )
                            }
                            placeholder={`الأساسي: ${formatPrice(product.base_price)}`}
                            inputMode="decimal"
                          />
                        </label>

                        <label className="quick-select-field">
                          <span>التصنيف</span>
                          <select
                            value={quickEdit.categoryId}
                            disabled={isSaving || bulkSaving}
                            onChange={(event) =>
                              updateQuickEdit(
                                product.item_id,
                                'categoryId',
                                event.target.value,
                              )
                            }
                          >
                            <option value="">بدون تصنيف</option>

                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                                {category.is_active ? '' : ' (مخفي)'}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="quick-select-field">
                          <span>حالة المخزون</span>
                          <select
                            value={quickEdit.stockStatus}
                            disabled={isSaving || bulkSaving}
                            onChange={(event) =>
                              updateQuickEdit(
                                product.item_id,
                                'stockStatus',
                                event.target.value,
                              )
                            }
                          >
                            {STOCK_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="quick-quantity-admin-field">
                          <span>الكمية</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={quickEdit.stockQuantity}
                            disabled={isSaving || bulkSaving}
                            onChange={(event) =>
                              updateQuickEdit(
                                product.item_id,
                                'stockQuantity',
                                event.target.value,
                              )
                            }
                            inputMode="numeric"
                          />
                        </label>

                        <button
                          type="button"
                          className="admin-primary-button quick-save-button"
                          disabled={isSaving || bulkSaving || !hasChanges}
                          onClick={() => handleSaveRow(product)}
                        >
                          {isSaving ? 'جارٍ الحفظ...' : 'حفظ الصف'}
                        </button>
                      </div>

                      {rowMessage ? (
                        <p
                          className={
                            rowMessage.type === 'success'
                              ? 'quick-save-message success'
                              : 'quick-save-message error'
                          }
                          role="status"
                        >
                          {rowMessage.text}
                        </p>
                      ) : null}
                    </div>

                    <div className="admin-product-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          navigate(`/admin/products/${product.item_id}`)
                        }
                      >
                        إدارة التفاصيل
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="pagination-controls">
              <button
                type="button"
                className="secondary-button"
                disabled={!canGoPrevious || bulkSaving}
                onClick={() => setPage((current) => current - 1)}
              >
                السابق
              </button>

              <span>
                صفحة {page + 1} من {totalPages}
              </span>

              <button
                type="button"
                className="secondary-button"
                disabled={!canGoNext || bulkSaving}
                onClick={() => setPage((current) => current + 1)}
              >
                التالي
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default AdminProductsPage