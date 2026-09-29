import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCart } from '../context/CartContext'

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(price))
}

async function getProductImageUrl(imagePath) {
  if (!imagePath) {
    return ''
  }

  const { data, error } = await supabase.storage
    .from('item-images')
    .createSignedUrl(imagePath, 60 * 60)

  if (error) {
    return ''
  }

  return data.signedUrl
}

function CartItemImage({ imagePath, name }) {
  const [imageUrl, setImageUrl] = useState('')
  const [hasImageError, setHasImageError] = useState(false)
  const fallbackImageUrl = `${import.meta.env.BASE_URL}logo.png`

  useEffect(() => {
    async function loadImage() {
      setHasImageError(false)

      const url = await getProductImageUrl(imagePath)
      setImageUrl(url)
    }

    loadImage()
  }, [imagePath])

  if (!imageUrl || hasImageError) {
    return (
      <img
        src={fallbackImageUrl}
        alt={`شعار دبوس اونلاين — ${name}`}
        className="cart-item-image cart-item-image-fallback"
      />
    )
  }

  return (
    <img
      src={imageUrl}
      alt={name}
      className="cart-item-image"
      onError={() => setHasImageError(true)}
    />
  )
}

function getAvailableStock(item) {
  const stockQuantity = Number(item?.stock_quantity)

  if (!Number.isFinite(stockQuantity)) {
    return null
  }

  return Math.max(0, Math.floor(stockQuantity))
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

function CartPage() {
  const navigate = useNavigate()
  const {
    items,
    totalItems,
    totalPrice,
    updateQuantity,
    refreshStock,
    removeItem,
    clearCart,
  } = useCart()

  const [stockMessage, setStockMessage] = useState('')
  const [isRefreshingStock, setIsRefreshingStock] = useState(false)

  useEffect(() => {
    async function refreshCartStock() {
      if (items.length === 0) {
        return
      }

      const productIds = items
        .map((item) => item.id)
        .filter(Boolean)

      if (productIds.length === 0) {
        return
      }

      setIsRefreshingStock(true)

      const { data, error } = await supabase.rpc('get_store_cart_stock', {
        product_ids: productIds,
      })

      if (error) {
        setStockMessage(
          'تعذر تحديث المخزون الآن. ستتم مراجعة الكمية عند تأكيد الطلب.',
        )
        setIsRefreshingStock(false)
        return
      }

      const freshStockById = new Map(
        (data ?? []).map((item) => [
          item.id,
          Math.max(0, Math.floor(Number(item.stock_quantity) || 0)),
        ]),
      )

      const changedItems = []
      const removedItems = []

      items.forEach((item) => {
        const freshStock = freshStockById.get(item.id)

        if (freshStock === undefined || freshStock === 0) {
          removedItems.push(item.name)
          return
        }

        if (item.quantity > freshStock) {
          changedItems.push({
            name: item.name,
            quantity: freshStock,
          })
        }
      })

      refreshStock(data ?? [])

      if (removedItems.length > 0 && changedItems.length > 0) {
        setStockMessage(
          `تم تحديث السلة: أُزيلت منتجات غير متوفرة، وتم تخفيض كمية ${changedItems.length} منتج حسب المخزون المتاح.`,
        )
      } else if (removedItems.length > 0) {
        setStockMessage(
          `تمت إزالة ${removedItems.length} منتج من السلة لأنه لم يعد متوفراً.`,
        )
      } else if (changedItems.length > 0) {
        setStockMessage(
          `تم تحديث كمية ${changedItems.length} منتج حسب المخزون المتاح.`,
        )
      } else {
        setStockMessage('')
      }

      setIsRefreshingStock(false)
    }

    refreshCartStock()
  }, [refreshStock])

  function handleQuantityChange(item, value) {
    const availableStock = getAvailableStock(item)
    const requestedQuantity = Number(value)

    if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1) {
      return
    }

    updateQuantity(
      item.id,
      getSafeQuantity(requestedQuantity, availableStock),
    )
  }

  function handleClearCart() {
    const confirmed = window.confirm(
      'هل تريد إزالة جميع المنتجات من السلة؟',
    )

    if (confirmed) {
      clearCart()
      setStockMessage('')
    }
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
            <h1>دبوس اونلاين</h1>
            <p>من الأساس حتى التشطيب</p>
          </div>
        </button>

        <button
          type="button"
          className="store-back-button"
          onClick={() => navigate('/')}
        >
          ← متابعة التسوق
        </button>
      </header>

      <main className="store-content">
        <section className="cart-page-heading">
          <div>
            <span className="eyebrow">سلة المشتريات</span>
            <h2>سلة التسوق</h2>
            <p>
              {totalItems > 0
                ? `لديك ${totalItems} قطعة في السلة.`
                : 'سلتك فارغة حالياً.'}
            </p>

            {isRefreshingStock ? (
              <small>جارٍ تحديث المخزون...</small>
            ) : null}
          </div>

          {items.length > 0 ? (
            <button
              type="button"
              className="cart-clear-button"
              onClick={handleClearCart}
            >
              إفراغ السلة
            </button>
          ) : null}
        </section>

        {stockMessage ? (
          <p className="cart-success-message" role="status">
            {stockMessage}
          </p>
        ) : null}

        {items.length === 0 ? (
          <section className="empty-state">
            <h2>السلة فارغة</h2>
            <p>أضف منتجات من المتجر لتظهر هنا.</p>
            <Link className="details-button empty-cart-link" to="/">
              العودة للمتجر
            </Link>
          </section>
        ) : (
          <div className="cart-layout">
            <section className="cart-items-list">
              {items.map((item) => (
                <article className="cart-item-card" key={item.id}>
                  <CartItemImage
                    imagePath={item.imagePath}
                    name={item.name}
                  />

                  <div className="cart-item-info">
                    {item.slug ? (
                      <Link to={`/product/${item.slug}`}>{item.name}</Link>
                    ) : (
                      <h3>{item.name}</h3>
                    )}

                    <p>{formatPrice(item.price)} للقطعة</p>
                  </div>

                  <label className="cart-quantity-field">
                    <span>الكمية</span>

                    <input
                      type="number"
                      min="1"
                      max={getAvailableStock(item) ?? undefined}
                      step="1"
                      value={item.quantity}
                      disabled={isRefreshingStock}
                      onChange={(event) =>
                        handleQuantityChange(item, event.target.value)
                      }
                      aria-label={`كمية ${item.name}`}
                    />

                    {getAvailableStock(item) !== null ? (
                      <small>
                        المتاح: {getAvailableStock(item)} قطعة
                      </small>
                    ) : null}
                  </label>

                  <div className="cart-item-total">
                    <strong>
                      {formatPrice(item.price * item.quantity)}
                    </strong>

                    <button
                      type="button"
                      className="cart-remove-button"
                      onClick={() => {
                        const confirmed = window.confirm(
                          `هل تريد حذف "${item.name}" من سلة المشتريات؟`,
                        )

                        if (confirmed) {
                          removeItem(item.id)
                        }
                      }}
                    >
                      إزالة
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <aside className="cart-summary-card">
              <h2>ملخص الطلب</h2>

              <div>
                <span>عدد القطع</span>
                <strong>{totalItems}</strong>
              </div>

              <div className="cart-total-line">
                <span>الإجمالي</span>
                <strong>{formatPrice(totalPrice)}</strong>
              </div>

              <button
                type="button"
                className="details-button cart-checkout-button"
                onClick={() => navigate('/checkout')}
                disabled={isRefreshingStock}
              >
                {isRefreshingStock
                  ? 'جارٍ تحديث المخزون...'
                  : 'إكمال الطلب'}
              </button>

              <p>
                سيتم تأكيد الطلب وإرساله عبر WhatsApp في الخطوة التالية.
              </p>
            </aside>
          </div>
        )}
      </main>

      <footer className="store-footer">
        جميع الحقوق محفوظة © {new Date().getFullYear()} دبوس اونلاين Abo Sabine
      </footer>
    </div>
  )
}

export default CartPage