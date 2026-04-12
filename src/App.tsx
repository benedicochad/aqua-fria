import React, { useState, useEffect } from "react";
import "./App.css"; 
import { supabase } from "./supabase";

type UserRole = "admin" | "customer";

type User = {
  id: string;
  name: string;
  role: UserRole;
  mobile: string;
};

type Product = {
  id: number;
  name: string;
  price: number;
};

type CartItem = Product & {
  quantity: number;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // 📝 Form States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mobile, setMobile] = useState("");

  // 🛒 Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // 🛠️ Admin States
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState<number | "">("");

  // 🔄 Fetch Products from Supabase
  const fetchProducts = async () => {
    const { data, error } = await supabase.from("products").select("*").order("id");
    if (data && !error) setProducts(data);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // 🔐 LOGIN HANDLER
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mobile.trim() || !password.trim()) {
      alert("Please enter your mobile number and password");
      return;
    }

    setIsLoading(true);
    
    // Query Supabase for the user
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("mobile", mobile)
      .eq("password", password)
      .single();

    setIsLoading(false);

    if (data && !error) {
      setUser({ id: data.id, name: data.name, role: data.role, mobile: data.mobile });
    } else {
      alert("Invalid mobile number or password. Please try again or register.");
    }
  };

  // 📝 REGISTER HANDLER
  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username.trim() || !mobile.trim() || !password.trim()) {
      alert("Please fill in required fields");
      return;
    }

    setIsLoading(true);
    
    // Check if mobile already exists in DB
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("mobile", mobile)
      .maybeSingle(); 

    if (existingUser) {
      setIsLoading(false);
      alert("This mobile number is already registered!");
      return;
    }

    // Insert new user into Supabase (Defaulting to customer role)
    const { error: insertError } = await supabase.from("users").insert([
      { mobile, password, name: username, email: email || null, role: "customer" }
    ]);

    setIsLoading(false);

    if (insertError) {
      alert(`Registration failed: ${insertError.message}`);
    } else {
      alert("Registration successful! You can now log in.");
      setUsername(""); setEmail(""); setMobile(""); setPassword("");
      setIsLoginView(true);
    }
  };

  // 🚪 LOGOUT
  const handleLogout = () => {
    setUser(null);
    setEmail(""); setPassword(""); setUsername(""); setMobile("");
    setIsLoginView(true);
    setCart([]); 
    resetAdminForm();
  };

  // ================= ADMIN FUNCTIONS =================

  const resetAdminForm = () => {
    setProductName("");
    setProductPrice("");
    setEditProductId(null);
    setShowProductForm(false);
  };

  const handleEditClick = (product: Product) => {
    setProductName(product.name);
    setProductPrice(product.price);
    setEditProductId(product.id);
    setShowProductForm(true);
  };

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!productName.trim() || productPrice === "") return;

    setIsLoading(true);
    const priceNum = Number(productPrice);

    if (editProductId) {
      // UPDATE EXISTING PRODUCT
      const { error } = await supabase
        .from("products")
        .update({ name: productName, price: priceNum })
        .eq("id", editProductId);

      if (!error) {
        setProducts(products.map(p => p.id === editProductId ? { ...p, name: productName, price: priceNum } : p));
        alert("Product updated successfully!");
      } else {
        alert("Failed to update product.");
      }
    } else {
      // ADD NEW PRODUCT
      const { data, error } = await supabase
        .from("products")
        .insert([{ name: productName, price: priceNum }])
        .select()
        .single();

      if (!error && data) {
        setProducts([...products, data]);
        alert("Product added successfully!");
      } else {
        alert("Failed to add product.");
      }
    }

    setIsLoading(false);
    resetAdminForm();
  };

  // ================= CART LOGIC =================
  const addToOrder = (product: Product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  const removeFromOrder = (productId: number) => {
    setCart((prevCart) => {
      return prevCart
        .map((item) =>
          item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0);
    });
  };

  const orderTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !user) return;
    setIsLoading(true);

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert([{ user_id: user.id, total_amount: orderTotal }])
      .select()
      .single();

    if (orderError || !orderData) {
      alert("Failed to place order. Please try again.");
      setIsLoading(false);
      return;
    }

    const orderItems = cart.map((item) => ({
      order_id: orderData.id,
      product_id: item.id,
      quantity: item.quantity,
      price_at_time: item.price
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    setIsLoading(false);

    if (!itemsError) {
      alert(`Thank you, ${user.name}! Your order has been placed in the database.\nTotal: ₱${orderTotal}`);
      setCart([]);
    } else {
      alert("Order placed, but failed to save item details.");
    }
  };

  // ================= RENDER LOGIC =================

  // 1. AUTHENTICATION VIEW
  if (!user) {
    return (
      <div className="login-container">
        <div className="login-card animate-fade">
          <h1 className="brand-title">💧 Aqua Fria Station</h1>
          <p className="brand-subtitle">Water Refilling & Delivery System</p>

          {isLoginView ? (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column" }}>
              <input className="input" type="tel" placeholder="Mobile Number" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
              <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button className="button" type="submit" disabled={isLoading}>
                {isLoading ? "Logging in..." : "Login"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column" }}>
              <input className="input" type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <input className="input" type="tel" placeholder="Mobile Number (Used for Login)" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
              <input className="input" type="email" placeholder="Email (Optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button className="button" type="submit" disabled={isLoading}>
                {isLoading ? "Registering..." : "Register"}
              </button>
            </form>
          )}

          <p 
            style={{ cursor: "pointer", marginTop: "20px", color: "#60a5fa", fontSize: "14px" }} 
            onClick={() => { setIsLoginView(!isLoginView); setMobile(""); setPassword(""); setEmail(""); setUsername(""); }}
          >
            {isLoginView ? "Don't have an account? Register here" : "Already have an account? Login here"}
          </p>
          {isLoginView && <p style={{ color: "#64748b", fontSize: "12px", marginTop: "12px" }}>Admin: 09123456789 / admin123</p>}
        </div>
      </div>
    );
  }

  // 2. ADMIN DASHBOARD VIEW
  if (user.role === "admin") {
    return (
      <div className="dashboard-wrapper">
        <div className="header animate-fade">
          <div>
            <h2 style={{ color: "#f87171" }}>🛠️ Admin Dashboard</h2>
            <p style={{ marginTop: "5px", color: "#94a3b8" }}>
              Welcome back, <strong>{user.name}</strong> <span className="role-badge" style={{ backgroundColor: "#f87171" }}>Admin</span>
            </p>
          </div>
          <button className="button btn-danger" onClick={handleLogout}>Logout</button>
        </div>

        <div className="dashboard-grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="card animate-fade delay-1">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 className="card-title" style={{ margin: 0 }}>📦 Manage Inventory</h3>
              <button className="button btn-success" style={{ width: "auto", margin: 0 }} onClick={() => setShowProductForm(!showProductForm)}>
                {showProductForm ? "Cancel" : "+ Add New Item"}
              </button>
            </div>

            {/* Admin Add/Edit Form */}
            {showProductForm && (
              <form onSubmit={handleSaveProduct} style={{ display: "flex", gap: "10px", marginBottom: "20px", padding: "15px", backgroundColor: "#1e293b", borderRadius: "8px" }}>
                <input className="input" style={{ margin: 0 }} type="text" placeholder="Item Name" value={productName} onChange={(e) => setProductName(e.target.value)} required />
                <input className="input" style={{ margin: 0 }} type="number" placeholder="Price (₱)" value={productPrice} onChange={(e) => setProductPrice(e.target.value === "" ? "" : Number(e.target.value))} required />
                <button className="button" style={{ width: "auto", margin: 0 }} type="submit" disabled={isLoading}>
                  {isLoading ? "Saving..." : editProductId ? "Update Item" : "Save Item"}
                </button>
              </form>
            )}

            {/* Product List for Admin */}
            <div>
              {products.length === 0 ? (
                <p style={{ color: "#94a3b8", fontStyle: "italic" }}>No items in database.</p>
              ) : (
                products.map((product) => (
                  <div key={product.id} className="product" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p className="product-name">{product.name}</p>
                      <p className="product-price">₱{product.price}</p>
                    </div>
                    <button 
                      className="button btn-outline" 
                      style={{ width: "auto", padding: "8px 16px", margin: 0 }} 
                      onClick={() => handleEditClick(product)}
                    >
                      ✏️ Edit
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. CUSTOMER DASHBOARD VIEW
  return (
    <div className="dashboard-wrapper">
      <div className="header animate-fade">
        <div>
          <h2 style={{ color: "#60a5fa" }}>💧 Aqua Fria Dashboard</h2>
          <p style={{ marginTop: "5px", color: "#94a3b8" }}>
            Welcome back, <strong>{user.name}</strong> 
            <span className="role-badge">{user.role}</span>
          </p>
        </div>
        <button className="button btn-danger" onClick={handleLogout}>Logout</button>
      </div>

      <div className="dashboard-grid">
        
        {/* MENU CARD */}
        <div className="card animate-fade delay-1">
          <h3 className="card-title">📋 Available Services</h3>
          <div>
            {products.length === 0 ? (
              <p style={{ color: "#94a3b8", fontStyle: "italic" }}>Loading products from database...</p>
            ) : (
              products.map((product) => (
                <div key={product.id} className="product">
                  <div>
                    <p className="product-name">{product.name}</p>
                    <p className="product-price">₱{product.price}</p>
                  </div>
                  <button 
                    className="button" 
                    style={{ width: "auto", padding: "8px 16px", margin: 0 }} 
                    onClick={() => addToOrder(product)}
                  >
                    + Add
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CART CARD */}
        <div className="card animate-fade delay-2">
          <h3 className="card-title">🛒 Current Order</h3>
          
          {cart.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b", margin: "auto" }}>
              <p style={{ fontStyle: "italic" }}>Your order is empty.</p>
              <p style={{ fontSize: "14px", marginTop: "8px" }}>Add items from the menu to get started.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {cart.map((item) => (
                <div key={item.id} className="cart-item">
                  <div>
                    <p className="product-name">{item.name}</p>
                    <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "14px" }}>
                      ₱{item.price} x {item.quantity} = <strong style={{ color: "#34d399" }}>₱{item.price * item.quantity}</strong>
                    </p>
                  </div>
                  <div className="cart-controls">
                    <button onClick={() => removeFromOrder(item.id)} className="button btn-outline">-</button>
                    <span style={{ fontWeight: "600", width: "24px", textAlign: "center" }}>{item.quantity}</span>
                    <button onClick={() => addToOrder(item)} className="button btn-outline">+</button>
                  </div>
                </div>
              ))}

              <div className="cart-total">Total: ₱{orderTotal}</div>
              <button 
                className="button btn-success" 
                onClick={handlePlaceOrder}
                disabled={isLoading}
              >
                {isLoading ? "Saving Order..." : "✅ Place Order"}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}