import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const CartContext = createContext(null)
const CART_STORAGE_KEY = 'dabous-online-store-cart'

function normalizeQuantity(value) {
  const quantity = Number(value)

  if (!Number.isFinite(quantity)) {
    return 1
  }

  return Math.max(1, Math.floor(quantity))
}

function getInitialCart() {
  try {
    const savedCart = window.localStorage.getItem(CART_STORAGE_KEY)

    if (!savedCart) {
      return []
    }

    const parsedCart = JSON.parse(savedCart)

    if (!Array.isArray(parsedCart)) {
      return []
    }

    return parsedCart
      .filter((item) => item && item.id)
      .map((item) => ({
        ...item,
        quantity: normalizeQuantity(item.quantity),
      }))
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(getInitialCart)

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  }, [items])

  function addItem(product, quantityToAdd = 1) {
    if (!product?.id) {
      return
    }

    const safeQuantityToAdd = normalizeQuantity(quantityToAdd)

    setItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.id === product.id)

      if (existingItem) {
        return currentItems.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: normalizeQuantity(
                  item.quantity + safeQuantityToAdd,
                ),
              }
            : item,
        )
      }

      return [
        ...currentItems,
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: Number(product.display_price ?? product.price ?? 0),
          imagePath: product.cover_image_path || product.image_path || '',
          quantity: safeQuantityToAdd,
        },
      ]
    })
  }

  function updateQuantity(productId, nextQuantity) {
    const safeQuantity = normalizeQuantity(nextQuantity)

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === productId
          ? { ...item, quantity: safeQuantity }
          : item,
      ),
    )
  }

  function removeItem(productId) {
    setItems((currentItems) =>
      currentItems.filter((item) => item.id !== productId),
    )
  }

  function clearCart() {
    setItems([])
  }

  const totalItems = useMemo(
    () =>
      items.reduce(
        (total, item) => total + normalizeQuantity(item.quantity),
        0,
      ),
    [items],
  )

  const totalPrice = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + Number(item.price ?? 0) * normalizeQuantity(item.quantity),
        0,
      ),
    [items],
  )

  const value = {
    items,
    totalItems,
    totalPrice,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)

  if (!context) {
    throw new Error('useCart must be used inside CartProvider.')
  }

  return context
}