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

function getImagePath(imagePath) {
  const value = String(imagePath ?? '').trim()

  if (!value) {
    return ''
  }

  return value.replace(/^item-images\//, '').replace(/^\/+/, '')
}

async function getImageUrl(imagePath) {
  const normalizedPath = getImagePath(imagePath)

  if (!normalizedPath) {
    return ''
  }

  const { data, error } = await supabase.storage
    .from('item-images')
    .createSignedUrl(normalizedPath, 60 * 60)

  if (error) {
    return ''
  }

  return data.signedUrl
}

function getSavedFilter() {
  try {
    const savedValue = window.localStorage.getItem(FILTER_STORAGE_KEY)

    if (!savedValue) {
      return { searchText: '', filterMode: 'all' }
    }

    const parsedValue = JSON.parse(savedValue)

    const isKnownFilter = FILTER_TABS.some(
      (tab) => tab.id === parsedValue?.filterMode,
    )

    return {
      searchText: String(parsedValue?.searchText ?? ''),
      filterMode: isKnownFilter ? parsedValue.filterMode : 'all',
    }
  } catch {
    return { searchText: '', filterMode: 'all' }
  }
}

function getRecentSearches() {
  try {
    const savedValue = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)

    if (!savedValue) {
      return []
    }

    const parsedValue = JSON.parse(savedValue)

    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue
      .filter(
        (item) =>
          item &&
          typeof item.searchText === 'string' &&
          typeof item.filterMode === 'string',
      )
      .slice(0, MAX_RECENT_SEARCHES)
  } catch {
    return []
  }
}

function getFilterLabel(filterMode) {
  return FILTER_TABS.find((tab) => tab.id === filterMode)?.label ?? 'كل الأصناف'
}

function getStockLabel(stockStatus) {
  if (stockStatus === 'in_stock') {
    return 'متوفر'
  }

  if (stockStatus === 'low_stock') {
    return 'كمية محدودة'
  }

  return 'غير متوفر'
}
function createSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getInitialQuickEdit(product) {
  return {
    isPublished: Boolean(product.is_published),
    onlinePrice:
      product.online_price === null || product.online_price === undefined
        ? ''
        : String(product.online_price),
  }
}

function AdminProductsPage() {
  const navigate = useNavigate()
  const initialFilter = useRef(getSavedFilter()).current

  const [searchInput, setSearchInput] = useState(initialFilter.searchText)
  const [searchText, setSearchText] = useState(initialFilter.searchText)
  const [filterMode, setFilterMode] = useState(initialFilter.filterMode)
  const [recentSearches, setRecentSearches] = useState(getRecentSearches)
  const [products, setProducts] = useState([])
  const [quickEdits, setQuickEdits] = useState({})
  const [savingProductId, setSavingProductId] = useState('')
  const [rowMessages, setRowMessages] = useState({})
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('get_store_admin_products', {
      search_text: searchText.trim() || null,
      filter_mode: filterMode,
      page_limit: PAGE_SIZE,
      page_offset: page * PAGE_SIZE,
    })

    if (error) {
      setErrorMessage(`تعذر تحميل المنتجات: ${error.message}`)
      setLoading(false)
      return
    }

    const productsWithImages = await Promise.all(
      (data ?? []).map(async (product) => {
        const imagePath = product.cover_image_path || product.image_path

        return {
          ...product,
          imageUrl: await getImageUrl(imagePath),
        }
      }),
    )

    setProducts(productsWithImages)
    setQuickEdits(
      Object.fromEntries(
        productsWithImages.map((product) => [
          product.item_id,
          getInitialQuickEdit(product),
        ]),
      ),
    )
    setRowMessages({})
    setTotalCount(Number(data?.[0]?.total_count ?? 0))
    setLoading(false)
  }, [filterMode, page, searchText])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        searchText,
        filterMode,
      }),
    )
  }, [filterMode, searchText])

  function saveRecentSearch(nextSearchText, nextFilterMode) {
    const cleanSearchText = nextSearchText.trim()

    if (!cleanSearchText && nextFilterMode === 'all') {
      return
    }

    const nextEntry = {
      searchText: cleanSearchText,
      filterMode: nextFilterMode,
    }

    setRecentSearches((currentSearches) => {
      const filteredSearches = currentSearches.filter(
        (item) =>
          !(
            item.searchText === nextEntry.searchText &&
            item.filterMode === nextEntry.filterMode
          ),
      )

      const updatedSearches = [nextEntry, ...filteredSearches].slice(
        0,
        MAX_RECENT_SEARCHES,
      )

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

  function handleSearch(event) {
    event.preventDefault()
    applyFilter(searchInput, filterMode)
  }

  function handleTabChange(nextFilterMode) {
    applyFilter(searchInput, nextFilterMode)
  }

  function handleRecentSearch(recentSearch) {
    applyFilter(recentSearch.searchText, recentSearch.filterMode)
  }

  function clearFilter() {
    setSearchInput('')
    setSearchText('')
    setFilterMode('all')
    setPage(0)
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
  }

  async function handleQuickSave(product) {
    const quickEdit = quickEdits[product.item_id] ?? getInitialQuickEdit(product)
    const cleanOnlinePrice = String(quickEdit.onlinePrice ?? '').trim()
    const onlinePrice =
      cleanOnlinePrice === '' ? null : Number(cleanOnlinePrice)

    if (
      onlinePrice !== null &&
      (!Number.isFinite(onlinePrice) || onlinePrice < 0)
    ) {
      setRowMessages((currentMessages) => ({
        ...currentMessages,
        [product.item_id]: {
          type: 'error',
          text: 'أدخل سعر متجر صحيحاً، أو اترك الحقل فارغاً لاستخدام السعر الأساسي.',
        },
      }))
      return
    }

    const effectivePrice =
      onlinePrice !== null ? onlinePrice : Number(product.base_price)

    if (
      quickEdit.isPublished &&
      (!Number.isFinite(effectivePrice) || effectivePrice < 0)
    ) {
      setRowMessages((currentMessages) => ({
        ...currentMessages,
        [product.item_id]: {
          type: 'error',
          text: 'لا يمكن عرض صنف أونلاين من دون سعر صالح.',
        },
      }))
      return
    }

    setSavingProductId(product.item_id)
    setRowMessages((currentMessages) => ({
      ...currentMessages,
      [product.item_id]: '',
    }))

    const payload = {
  item_id: product.item_id,
  cover_image_path: product.cover_image_path ?? null,
  slug: product.slug || createSlug(product.name),
  is_published: Boolean(quickEdit.isPublished),
  online_price: onlinePrice,
  old_price: null,
  stock_quantity: Number(product.stock_quantity ?? 0),
  stock_status: product.stock_status ?? 'out_of_stock',
  show_when_out_of_stock: true,
  sort_order: 0,
}

    const { error } = await supabase
      .from('store_product_settings')
      .upsert(payload, { onConflict: 'item_id' })

    if (error) {
      setRowMessages((currentMessages) => ({
        ...currentMessages,
        [product.item_id]: {
          type: 'error',
          text: `تعذر الحفظ: ${error.message}`,
        },
      }))
      setSavingProductId('')
      return
    }

    setProducts((currentProducts) =>
      currentProducts.map((currentProduct) =>
        currentProduct.item_id === product.item_id
          ? {
              ...currentProduct,
              is_published: Boolean(quickEdit.isPublished),
              online_price: onlinePrice,
            }
          : currentProduct,
      ),
    )

    setRowMessages((currentMessages) => ({
      ...currentMessages,
      [product.item_id]: {
        type: 'success',
        text: 'تم حفظ العرض والسعر بنجاح.',
      },
    }))
    setSavingProductId('')
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const canGoPrevious = page > 0
  const canGoNext = page + 1 < totalPages
  const hasActiveFilter = Boolean(searchText.trim()) || filterMode !== 'all'

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
          ابحث عن الصنف بأي ترتيب للكلمات، ثم عدّل العرض والسعر مباشرة من
          النتيجة أو افتح إدارة المنتج للتفاصيل الكاملة.
        </p>
      </header>

      <section className="admin-search-card">
        <form className="product-search-form" onSubmit={handleSearch}>
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
              onClick={clearFilter}
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
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {recentSearches.length > 0 ? (
          <div className="recent-admin-searches">
            <span>آخر 5 فلاتر:</span>

            <div>
              {recentSearches.map((recentSearch, index) => {
                const visibleText = recentSearch.searchText
                  ? `${recentSearch.searchText} — ${getFilterLabel(recentSearch.filterMode)}`
                  : getFilterLabel(recentSearch.filterMode)

                return (
                  <button
                    key={`${recentSearch.searchText}-${recentSearch.filterMode}-${index}`}
                    type="button"
                    className="recent-admin-search-button"
                    onClick={() => handleRecentSearch(recentSearch)}
                  >
                    {visibleText}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <p className="admin-alert error-alert">{errorMessage}</p>
      ) : null}

      <section className="admin-list-card">
        <div className="admin-section-heading">
          <div>
            <h2>نتائج الأصناف</h2>
            <p className="admin-results-filter-note">
              الفلتر الحالي: {getFilterLabel(filterMode)}
              {searchText.trim() ? ` — البحث: ${searchText.trim()}` : ''}
            </p>
          </div>

          <span className="count-chip">{totalCount}</span>
        </div>

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
                const isSaving = savingProductId === product.item_id

                return (
                  <article className="admin-product-row" key={product.item_id}>
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

                        {product.online_price !== null ? (
                          <span>
                            سعر المتجر الحالي: {formatPrice(product.online_price)}
                          </span>
                        ) : (
                          <span>سعر المتجر: السعر الأساسي</span>
                        )}

                        {product.category_name ? (
                          <span>التصنيف: {product.category_name}</span>
                        ) : null}

                        <span>
                          المخزون: {getStockLabel(product.stock_status)}
                        </span>

                        <span>الكمية: {product.stock_quantity}</span>
                      </div>

                      <div className="quick-product-edit">
                        <label className="quick-publish-field">
                          <input
                            type="checkbox"
                            checked={quickEdit.isPublished}
                            disabled={isSaving}
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
                            disabled={isSaving}
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

                        <button
                          type="button"
                          className="admin-primary-button quick-save-button"
                          disabled={isSaving}
                          onClick={() => handleQuickSave(product)}
                        >
                          {isSaving ? 'جارٍ الحفظ...' : 'حفظ سريع'}
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
                disabled={!canGoPrevious}
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
                disabled={!canGoNext}
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