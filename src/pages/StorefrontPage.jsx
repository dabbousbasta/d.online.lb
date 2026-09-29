import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCart } from '../context/CartContext'

const IMAGE_BUCKET = 'item-images'

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(price))
}

function normalizeStoragePath(imagePath) {
  const value = String(imagePath ?? '').trim()

  if (!value) {
    return ''
  }

  const bucketPrefix = `${IMAGE_BUCKET}/`

  if (value.startsWith(bucketPrefix)) {
    return value.slice(bucketPrefix.length)
  }

  return value.replace(/^\/+/, '')
}

async function getProductImageUrl(imagePath) {
  const normalizedPath = normalizeStoragePath(imagePath)

  if (!normalizedPath) {
    return ''
  }

  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(normalizedPath, 60 * 60)

  if (error) {
    console.error('Image signed URL error:', normalizedPath, error.message)
    return ''
  }

  const separator = data.signedUrl.includes('?') ? '&' : '?'

  return `${data.signedUrl}${separator}cacheNonce=${Date.now()}`
}

function ProductImage({ imageUrl, productName }) {
  const [hasImageError, setHasImageError] = useState(false)
  const fallbackImageUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/logo.png`

  if (!imageUrl || hasImageError) {
    return (
      <img
        src={fallbackImageUrl}
        alt={`شعار دبوس اونلاين — ${productName}`}
        className="product-list-image product-list-image-fallback"
        loading="lazy"
      />
    )
  }

  return (
    <img
      src={imageUrl}
      alt={productName}
      className="product-list-image"
      loading="lazy"
      onError={() => setHasImageError(true)}
    />
  )
}

function getSafeQuantity(value, maximumQuantity = null) {
  const quantity = Number(value)

  if (!Number.isFinite(quantity)) {
    return 1
  }

  const safeQuantity = Math.max(1, Math.floor(quantity))

  if (maximumQuantity === null) {
    return safeQuantity
  }

  return Math.min(safeQuantity, maximumQuantity)
}

function getAvailableStock(product) {
  const stockQuantity = Number(product?.stock_quantity)

  if (!Number.isFinite(stockQuantity)) {
    return null
  }

  return Math.max(0, Math.floor(stockQuantity))
}

function StorefrontPage() {
  const navigate = useNavigate()
  const { addItem, totalItems } = useCart()

  const [store, setStore] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [cartMessage, setCartMessage] = useState('')
  const [quantities, setQuantities] = useState({})

  useEffect(() => {
    async function loadStorefront() {
      setLoading(true)
      setErrorMessage('')

      const [settingsResult, productsResult] = await Promise.all([
        supabase
          .from('store_settings')
          .select(
            'store_name, store_tagline, whatsapp_number, currency_code, currency_symbol',
          )
          .limit(1)
          .maybeSingle(),
        supabase.rpc('get_store_public_products'),
      ])

      if (settingsResult.error) {
        setErrorMessage(
          `خطأ في تحميل إعدادات المتجر: ${settingsResult.error.message}`,
        )
        setLoading(false)
        return
      }

      if (productsResult.error) {
        setErrorMessage(
          `خطأ في تحميل المنتجات: ${productsResult.error.message}`,
        )
        setLoading(false)
        return
      }

      const productsWithImages = await Promise.all(
        (productsResult.data ?? []).map(async (product) => {
          const imagePath = product.cover_image_path || product.image_path

          return {
            ...product,
            imageUrl: await getProductImageUrl(imagePath),
          }
        }),
      )

      setStore(settingsResult.data)
      setProducts(productsWithImages)
      setLoading(false)
    }

    loadStorefront()
  }, [])

  const categories = useMemo(() => {
    const uniqueCategories = [
      ...new Set(
        products
          .map((product) => String(product.category_name ?? '').trim())
          .filter(Boolean),
      ),
    ]

    return uniqueCategories.sort((firstCategory, secondCategory) =>
      firstCategory.localeCompare(secondCategory, 'ar'),
    )
  }, [products])

  const filteredProducts = useMemo(() => {
    const normalizeSearchText = (value) =>
      String(value ?? '')
        .toLowerCase()
        .trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ـ/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const searchWords = normalizeSearchText(searchQuery)
      .split(' ')
      .filter(Boolean)

    return products.filter((product) => {
      const productCategory = String(product.category_name ?? '').trim()

      const matchesCategory =
        selectedCategory === 'all' || productCategory === selectedCategory

      const searchableText = normalizeSearchText(
        [
          product.name,
          product.short_description,
          product.description,
          product.category_name,
          product.slug,
        ]
          .filter(Boolean)
          .join(' '),
      )

      const matchesSearch =
        searchWords.length === 0 ||
        searchWords.every((word) => searchableText.includes(word))

      return matchesCategory && matchesSearch
    })
  }, [products, searchQuery, selectedCategory])

  function handleQuantityChange(product, value) {
    const availableStock = getAvailableStock(product)

    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [product.id]: getSafeQuantity(value, availableStock),
    }))
  }

  function handleAddToCart(event, product) {
    event.stopPropagation()

    const availableStock = getAvailableStock(product)

    if (product.stock_status === 'out_of_stock' || availableStock === 0) {
      setCartMessage('هذا المنتج غير متوفر حالياً.')
      return
    }

    const requestedQuantity = getSafeQuantity(quantities[product.id] ?? 1)

    const quantityToAdd = getSafeQuantity(
      quantities[product.id] ?? 1,
      availableStock,
    )

    addItem(product, quantityToAdd)

    if (availableStock !== null && requestedQuantity > availableStock) {
      setCartMessage(
        `تمت إضافة ${quantityToAdd} من "${product.name}" لأن الكمية المتاحة هي ${availableStock}.`,
      )
    } else {
      setCartMessage(
        `تمت إضافة ${quantityToAdd} من "${product.name}" إلى السلة.`,
      )
    }

    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [product.id]: 1,
    }))

    window.setTimeout(() => {
      setCartMessage('')
    }, 2500)
  }

  function openProduct(productSlug) {
    navigate(`/product/${productSlug}`)
  }

  if (loading) {
    return (
      <main className="page-state">
        <p>⏳ جارٍ تحميل متجر دبوس اونلاين...</p>
      </main>
    )
  }

  if (errorMessage) {
    return (
      <main className="page-state error-state">
        <h1>حدث خطأ في تحميل المتجر</h1>
        <p>{errorMessage}</p>
      </main>
    )
  }

  return (
    <div className="store-app" dir="rtl">
      <header className="store-header">
        <button
          type="button"
          className="brand brand-home-button"
          onClick={() => navigate('/')}
          aria-label="الذهاب إلى الصفحة الرئيسية"
          title="الذهاب إلى الصفحة الرئيسية"
        >
          <div className="brand-mark">د</div>

          <div className="brand-text">
            <h1>{store?.store_name ?? 'دبوس اونلاين'}</h1>
            <p>{store?.store_tagline ?? 'من الأساس حتى التشطيب'}</p>
          </div>
        </button>

        <div className="store-header-actions">
          <button
            type="button"
            className="store-cart-button"
            onClick={() => navigate('/cart')}
            aria-label={`سلة المشتريات، فيها ${totalItems} قطعة`}
          >
            <span className="store-cart-icon" aria-hidden="true">🛒</span>
            <span>السلة</span>
            <span className="store-cart-count">{totalItems}</span>
          </button>

          <div className="header-note">متجر دبوس اونلاين</div>
        </div>
      </header>

      <main className="store-content">
        <section className="intro-section">
          <span className="eyebrow">منتجات مختارة</span>
          <h2>منتجات دبوس اونلاين</h2>
          <p>ابحث عن الصنف أو اختر التصنيف، ثم اضغط على الصنف لفتح تفاصيله.</p>
        </section>

        <section className="store-filters" aria-label="البحث والتصنيفات">
          <label className="search-field">
            <span className="sr-only">البحث عن منتج</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ابحث باسم الصنف أو الوصف أو التصنيف..."
              aria-label="البحث عن منتج"
            />
          </label>

          <div
            className="category-filters"
            role="group"
            aria-label="تصفية المنتجات حسب التصنيف"
          >
            <button
              type="button"
              className={
                selectedCategory === 'all'
                  ? 'category-button active'
                  : 'category-button'
              }
              onClick={() => setSelectedCategory('all')}
            >
              كل المنتجات
            </button>

            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={
                  selectedCategory === category
                    ? 'category-button active'
                    : 'category-button'
                }
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <p className="products-count">
            عدد الأصناف الظاهرة: {filteredProducts.length}
          </p>
        </section>

        {cartMessage ? (
          <p
            className="cart-success-message storefront-cart-message"
            role="status"
          >
            {cartMessage}
          </p>
        ) : null}

        {products.length === 0 ? (
          <section className="empty-state">
            <h2>لا توجد منتجات منشورة حالياً</h2>
            <p>ستظهر المنتجات هنا فور نشرها من لوحة الإدارة.</p>
          </section>
        ) : filteredProducts.length === 0 ? (
          <section className="empty-state">
            <h2>لا توجد أصناف مطابقة</h2>
            <p>جرّب تغيير كلمة البحث أو اختر تصنيفاً آخر.</p>

            <button
              type="button"
              className="details-button"
              onClick={() => {
                setSearchQuery('')
                setSelectedCategory('all')
              }}
            >
              عرض كل المنتجات
            </button>
          </section>
        ) : (
          <section className="products-list" aria-label="قائمة المنتجات">
            {filteredProducts.map((product) => {
              const availableStock = getAvailableStock(product)

              const isAvailable =
                product.stock_status !== 'out_of_stock' &&
                availableStock !== 0

              const quantityValue = getSafeQuantity(
                quantities[product.id] ?? 1,
                availableStock,
              )

              return (
                <article
                  className="product-list-row"
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openProduct(product.slug)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openProduct(product.slug)
                    }
                  }}
                  aria-label={`فتح تفاصيل المنتج ${product.name}`}
                >
                  <div className="product-list-image-wrap">
                    {product.discount_percent ? (
                      <span className="discount-badge">
                        خصم {product.discount_percent}%
                      </span>
                    ) : null}

                    <ProductImage
                      imageUrl={product.imageUrl}
                      productName={product.name}
                    />
                  </div>

                  <div className="product-list-main">
                    <div className="product-list-title-row">
                      <div>
                        {product.category_name ? (
                          <p className="product-category">
                            {product.category_name}
                          </p>
                        ) : null}

                        <h3>{product.name}</h3>
                      </div>

                      <span
                        className={
                          isAvailable
                            ? 'stock available'
                            : 'stock unavailable'
                        }
                      >
                        {!isAvailable
                          ? 'غير متوفر'
                          : availableStock === null
                            ? 'متوفر'
                            : availableStock <= 3
                              ? `كمية محدودة: ${availableStock} قطعة`
                              : `متوفر: ${availableStock} قطعة`}
                      </span>
                    </div>

                    {product.short_description ? (
                      <p className="product-list-description">
                        {product.short_description}
                      </p>
                    ) : product.description ? (
                      <p className="product-list-description">
                        {product.description}
                      </p>
                    ) : (
                      <p className="product-list-description empty-description">
                        اضغط على الصنف للاطلاع على التفاصيل والمواصفات.
                      </p>
                    )}
                  </div>

                  <div
                    className="product-list-purchase"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="product-list-price">
                      <strong>{formatPrice(product.display_price)}</strong>

                      {product.old_price ? (
                        <span className="old-price">
                          {formatPrice(product.old_price)}
                        </span>
                      ) : null}
                    </div>

                    <label className="quick-quantity-field">
                      <span>الكمية</span>

                      <input
                        type="number"
                        min="1"
                        max={availableStock ?? undefined}
                        step="1"
                        value={quantityValue}
                        disabled={!isAvailable}
                        inputMode="numeric"
                        onChange={(event) =>
                          handleQuantityChange(product, event.target.value)
                        }
                        onBlur={(event) =>
                          handleQuantityChange(product, event.target.value)
                        }
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`كمية ${product.name}`}
                      />
                    </label>

                    <button
                      type="button"
                      className="details-button add-to-cart-button"
                      disabled={!isAvailable}
                      onClick={(event) => handleAddToCart(event, product)}
                    >
                      {isAvailable ? 'أضف إلى السلة' : 'غير متوفر'}
                    </button>

                    <span className="product-open-hint">
                      اضغط لفتح الصنف
                    </span>
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </main>

      <footer className="store-footer">
        جميع الحقوق محفوظة © {new Date().getFullYear()}{' '}
        {store?.store_name ?? 'دبوس اونلاين - Abo Sabine'}
      </footer>
    </div>
  )
}

export default StorefrontPage