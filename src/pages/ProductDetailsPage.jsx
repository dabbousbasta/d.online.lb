import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

function cleanWhatsAppNumber(value) {
  return String(value ?? '').replace(/\D/g, '')
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
    return ''
  }

  return data.signedUrl
}

function getSafeQuantity(value) {
  const quantity = Number(value)

  if (!Number.isFinite(quantity)) {
    return 1
  }

  return Math.max(1, Math.floor(quantity))
}

function ProductDetailsImage({ imageUrl, productName }) {
  const [hasImageError, setHasImageError] = useState(false)
  const fallbackImageUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/logo.png`

  if (!imageUrl || hasImageError) {
    return (
      <img
        src={fallbackImageUrl}
        alt={`شعار دبوس اونلاين — ${productName}`}
        className="product-details-image product-details-image-fallback"
      />
    )
  }

  return (
    <img
      src={imageUrl}
      alt={productName}
      className="product-details-image"
      onError={() => setHasImageError(true)}
    />
  )
}

function ProductDetailsPage() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const { addItem, totalItems } = useCart()

  const [product, setProduct] = useState(null)
  const [imageUrl, setImageUrl] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [cartMessage, setCartMessage] = useState('')
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    async function loadProduct() {
      setLoading(true)
      setErrorMessage('')
      setCartMessage('')
      setQuantity(1)

      const [productResult, settingsResult] = await Promise.all([
        supabase.rpc('get_store_public_product', {
          product_slug: slug,
        }),
        supabase
          .from('store_settings')
          .select('whatsapp_number')
          .limit(1)
          .maybeSingle(),
      ])

      if (productResult.error) {
        setErrorMessage(`تعذر تحميل المنتج: ${productResult.error.message}`)
        setLoading(false)
        return
      }

      const loadedProduct = productResult.data?.[0]

      if (!loadedProduct) {
        setErrorMessage('هذا المنتج غير متوفر أو لم يعد منشوراً.')
        setLoading(false)
        return
      }

      const imagePath =
        loadedProduct.cover_image_path || loadedProduct.image_path

      const loadedImageUrl = await getProductImageUrl(imagePath)

      setProduct(loadedProduct)
      setImageUrl(loadedImageUrl)
      setWhatsappNumber(
        cleanWhatsAppNumber(settingsResult.data?.whatsapp_number),
      )
      setLoading(false)
    }

    loadProduct()
  }, [slug])

  function handleAddToCart() {
    if (!product || product.stock_status === 'out_of_stock') {
      return
    }

    const quantityToAdd = getSafeQuantity(quantity)

    addItem(product, quantityToAdd)
    setCartMessage(
      `تمت إضافة ${quantityToAdd} من "${product.name}" إلى السلة.`,
    )
    setQuantity(1)
  }

  function handleWhatsAppInquiry() {
    if (!product || !whatsappNumber) {
      return
    }

    const productUrl = `${window.location.origin}${window.location.pathname}#/product/${product.slug}`

    const message = [
      'مرحباً، أريد الاستفسار عن هذا المنتج:',
      '',
      `المنتج: ${product.name}`,
      `السعر: ${formatPrice(product.display_price)}`,
      '',
      `رابط المنتج: ${productUrl}`,
    ].join('\n')

    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <main className="page-state">
        <p>⏳ جارٍ تحميل المنتج...</p>
      </main>
    )
  }

  if (errorMessage || !product) {
    return (
      <main className="page-state error-state">
        <h1>تعذر فتح المنتج</h1>
        <p>{errorMessage || 'لم يتم العثور على المنتج.'}</p>
        <button
          type="button"
          className="details-button"
          onClick={() => navigate('/')}
        >
          العودة إلى المتجر
        </button>
      </main>
    )
  }

  const isAvailable = product.stock_status !== 'out_of_stock'
  const specifications = Object.entries(product.specifications ?? {})

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
            <h1>دبوس اونلاين</h1>
            <p>من الأساس حتى التشطيب</p>
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

          <button
            type="button"
            className="store-back-button"
            onClick={() => navigate('/')}
          >
            ← العودة إلى المتجر
          </button>
        </div>
      </header>

      <main className="store-content">
        <article className="product-details-card">
          <section className="product-details-image-section">
            <ProductDetailsImage
              imageUrl={imageUrl}
              productName={product.name}
            />
          </section>

          <section className="product-details-info">
            {product.category_name ? (
              <p className="product-category">{product.category_name}</p>
            ) : null}

            <h1>{product.name}</h1>

            {product.short_description ? (
              <p className="product-details-short-description">
                {product.short_description}
              </p>
            ) : null}

            <div className="product-details-price-row">
              <strong>{formatPrice(product.display_price)}</strong>

              {product.old_price ? (
                <span className="old-price">
                  {formatPrice(product.old_price)}
                </span>
              ) : null}
            </div>

            <span
              className={isAvailable ? 'stock available' : 'stock unavailable'}
            >
              {isAvailable ? 'متوفر حالياً' : 'غير متوفر حالياً'}
            </span>

            {product.description ? (
              <div className="product-details-description">
                <h2>وصف المنتج</h2>
                <p>{product.description}</p>
              </div>
            ) : null}

            {specifications.length > 0 ? (
              <div className="product-details-specifications">
                <h2>المواصفات</h2>

                <dl>
                  {specifications.map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {cartMessage ? (
              <p className="cart-success-message">{cartMessage}</p>
            ) : null}

            <div className="product-details-actions">
              <label className="product-quantity-field">
                <span>الكمية</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  disabled={!isAvailable}
                  inputMode="numeric"
                  onChange={(event) => setQuantity(event.target.value)}
                  onBlur={(event) =>
                    setQuantity(getSafeQuantity(event.target.value))
                  }
                  aria-label={`كمية ${product.name}`}
                />
              </label>

              <button
                type="button"
                className="details-button product-details-order-button"
                disabled={!isAvailable}
                onClick={handleAddToCart}
              >
                {isAvailable ? 'أضف إلى السلة' : 'غير متوفر حالياً'}
              </button>

              {whatsappNumber ? (
                <button
                  type="button"
                  className="product-whatsapp-button"
                  onClick={handleWhatsAppInquiry}
                >
                  استفسار عبر WhatsApp
                </button>
              ) : null}
            </div>
          </section>
        </article>
      </main>

      <footer className="store-footer">
        جميع الحقوق محفوظة © {new Date().getFullYear()} دبوس اونلاين
      </footer>
    </div>
  )
}

export default ProductDetailsPage