import React, { useState, useEffect } from "react";
import "./App.css";
import { supabase } from "./supabase";

// --- TYPES ---
type UserRole = "admin" | "customer";
type User = {
  id: string;
  name: string;
  role: UserRole;
  mobile: string;
  email?: string;
  loyaltyPoints?: number;
};

type Product = { id: number; name: string; price: number; stock: number };
type CartItem = Product & { quantity: number };
type OrderStatus = "pending" | "processing" | "out_for_delivery" | "delivered" | "cancelled";

type Rider = {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  status: "active" | "inactive";
  createdAt: Date;
};

type ReceiptInfo = {
  orderId: number;
  total: number;
  status: OrderStatus;
  customerName?: string;
  customerMobile?: string;
  driver?: string;
  notes?: string;
  items: { id: number; name: string; price: number; quantity: number }[];
  date: Date;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Auth States
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  // App States
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState("");
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [ordersList, setOrdersList] = useState<ReceiptInfo[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);

  // Admin CRM
  const [selectedAdminUser, setSelectedAdminUser] = useState<any>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<"store" | "orders" | "overview" | "riders" | "inventory" | "users" | "settings">("store");
  const [orderFilter, setOrderFilter] = useState<OrderStatus | "all">("all");

  // Product Management
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState<number | "">("");
  const [productStock, setProductStock] = useState<number | "">("");

  // Rider Management
  const [riderName, setRiderName] = useState("");
  const [riderMobile, setRiderMobile] = useState("");
  const [riderEmail, setRiderEmail] = useState("");

  // Modals
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<number | null>(null);
  const [confirmCancelOrder, setConfirmCancelOrder] = useState<number | null>(null);
  const [confirmDeleteRider, setConfirmDeleteRider] = useState<string | null>(null);

  // Settings
  const [shopLocationUrl, setShopLocationUrl] = useState("");
  const [editLocationUrl, setEditLocationUrl] = useState("");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  // --- DATA FETCHING ---
  const fetchProducts = async () => {
    const { data } = await supabase.from("products").select("*").order("id");
    setProducts(data?.map((p: any) => ({ ...p, stock: p.stock ?? 100 })) || []);
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from("settings").select("value").eq("key", "shop_location").maybeSingle();
    const url = data?.value || "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3932.748!2d123.2787025!3d9.3599451!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33ab6fe703de90f1:0x767b7f4b09b8dce1!2sAqua%20Fria!5e0!3m2!1sen!2sph!4v1680000000000";
    setShopLocationUrl(url);
    setEditLocationUrl(url);
  };

  const fetchOrders = async () => {
    if (!user) return;
    let query = supabase
      .from("orders")
      .select(`
        id, total_amount, created_at, status, driver, notes,
        users!inner(name, mobile),
        order_items(quantity, price_at_time, products(id, name))
      `)
      .order("created_at", { ascending: false });

    if (user.role === "customer") query = query.eq("user_id", user.id);

    const { data } = await query;
    if (data) {
      const formatted = data.map((o: any) => ({
        orderId: o.id,
        total: o.total_amount,
        status: o.status || "pending",
        driver: o.driver,
        customerName: o.users?.name,
        customerMobile: o.users?.mobile,
        notes: o.notes,
        date: new Date(o.created_at),
        items: o.order_items.map((i: any) => ({
          id: i.products?.id || 0,
          name: i.products?.name || "Item",
          price: i.price_at_time,
          quantity: i.quantity,
        })),
      }));
      setOrdersList(formatted);
    }
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    setRegisteredUsers(data || []);
  };

  const fetchRiders = async () => {
    const { data } = await supabase.from("riders").select("*").order("created_at", { ascending: false });
    setRiders(data?.map((r: any) => ({ ...r, createdAt: new Date(r.created_at) })) || []);
  };

  useEffect(() => {
    fetchProducts();
    fetchSettings();
    
    // Real-time subscription to settings changes
    const settingsSubscription = supabase
      .channel("settings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings", filter: "key=eq.shop_location" },
        (payload: any) => {
          if (payload.new?.value) {
            setShopLocationUrl(payload.new.value);
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(settingsSubscription);
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchOrders();
      if (user.role === "admin") {
        fetchUsers();
        fetchRiders();
      }
    }
  }, [user, activeTab]);

  // --- AUTHENTICATION with HIDDEN ADMIN LOGIN ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (mobile === "09123456789" && password === "admin123") {
      setUser({
        id: "admin-hidden",
        name: "Admin",
        role: "admin",
        mobile: "09123456789",
        email: "admin@aquafria.com",
        loyaltyPoints: 9999,
      });
      setActiveTab("overview");
      showToast("Welcome Admin! (Hidden Login Activated)", "success");
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("mobile", mobile)
      .eq("password", password)
      .single();

    setIsLoading(false);

    if (data && !error) {
      setUser({
        id: data.id,
        name: data.name,
        role: data.role,
        mobile: data.mobile,
        email: data.email,
        loyaltyPoints: data.loyalty_points || 0,
      });
      setActiveTab(data.role === "admin" ? "overview" : "store");
      showToast(`Welcome back, ${data.name}!`);
    } else {
      showToast("Invalid mobile number or password.", "error");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { data: existing } = await supabase.from("users").select("id").eq("mobile", mobile).maybeSingle();
    if (existing) {
      setIsLoading(false);
      return showToast("This mobile number is already registered.", "error");
    }

    const { error } = await supabase.from("users").insert([{
      mobile,
      password,
      name: username,
      email: email || null,
      role: "customer",
      loyalty_points: 0
    }]);

    setIsLoading(false);
    if (!error) {
      showToast("Registration successful! Please login.");
      setIsLoginView(true);
    } else {
      showToast("Registration failed. Try again.", "error");
    }
  };

  const handleLogout = () => {
    setUser(null);
    setIsLoginView(true);
    setCart([]);
    setReceipt(null);
    setOrderNotes("");
    setSearchQuery("");
  };

  // --- PRODUCT MANAGEMENT ---
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName || !productPrice || !productStock) return;
    setIsLoading(true);

    const payload = { name: productName, price: Number(productPrice), stock: Number(productStock) };

    if (editProductId) {
      await supabase.from("products").update(payload).eq("id", editProductId);
      showToast("Product updated successfully!");
    } else {
      await supabase.from("products").insert([payload]);
      showToast("New product added!");
    }

    fetchProducts();
    resetProductForm();
    setIsLoading(false);
  };

  const handleDeleteProduct = async () => {
    if (!confirmDeleteProduct) return;
    setIsLoading(true);
    await supabase.from("products").delete().eq("id", confirmDeleteProduct);
    fetchProducts();
    setConfirmDeleteProduct(null);
    setIsLoading(false);
    showToast("Product deleted");
  };

  const resetProductForm = () => {
    setEditProductId(null);
    setProductName("");
    setProductPrice("");
    setProductStock("");
  };

  // --- ORDER MANAGEMENT ---
  const updateOrderStatus = async (orderId: number, newStatus: string, driver?: string) => {
    const payload: any = { status: newStatus };
    if (driver) payload.driver = driver;
    await supabase.from("orders").update(payload).eq("id", orderId);

    setOrdersList(prev =>
      prev.map(o =>
        o.orderId === orderId ? { ...o, status: newStatus as OrderStatus, driver: driver || o.driver } : o
      )
    );
    showToast(driver ? "Driver assigned" : `Order updated`);
  };

  const handleQuickAction = (orderId: number, currentStatus: string) => {
    const map: any = { pending: "processing", processing: "out_for_delivery", out_for_delivery: "delivered" };
    updateOrderStatus(orderId, map[currentStatus] || currentStatus);
  };

  const handleCancelOrder = async () => {
    if (!confirmCancelOrder) return;
    setIsLoading(true);
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", confirmCancelOrder);
    setOrdersList(prev => prev.map(o => o.orderId === confirmCancelOrder ? { ...o, status: "cancelled" } : o));
    showToast("Order cancelled");
    setConfirmCancelOrder(null);
    setIsLoading(false);
  };

  // --- RIDER MANAGEMENT ---
  const handleAddRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riderName || !riderMobile) {
      showToast("Name and mobile are required", "error");
      return;
    }
    setIsLoading(true);

    const { error } = await supabase.from("riders").insert([{
      name: riderName,
      mobile: riderMobile,
      email: riderEmail || null,
      status: "active"
    }]);

    if (!error) {
      showToast("Rider registered successfully!");
      fetchRiders();
      setRiderName("");
      setRiderMobile("");
      setRiderEmail("");
    } else {
      showToast("Failed to register rider", "error");
    }
    setIsLoading(false);
  };

  const handleDeleteRider = async () => {
    if (!confirmDeleteRider) return;
    setIsLoading(true);
    await supabase.from("riders").delete().eq("id", confirmDeleteRider);
    fetchRiders();
    setConfirmDeleteRider(null);
    setIsLoading(false);
    showToast("Rider deleted");
  };

  const toggleRiderStatus = async (riderId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await supabase.from("riders").update({ status: newStatus }).eq("id", riderId);
    fetchRiders();
    showToast(`Rider ${newStatus}`);
  };

  // --- CART & ORDER ---
  const handleCart = (product: Product, delta: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      const nextQty = (existing?.quantity || 0) + delta;

      if (nextQty > product.stock) {
        showToast(`Only ${product.stock} left in stock!`, "error");
        return prev;
      }

      if (existing) {
        return nextQty > 0
          ? prev.map(i => i.id === product.id ? { ...i, quantity: nextQty } : i)
          : prev.filter(i => i.id !== product.id);
      }

      if (delta > 0) showToast(`Added ${product.name}`);
      return delta > 0 ? [...prev, { ...product, quantity: 1 }] : prev;
    });
  };

  const handlePlaceOrder = async () => {
    if (!cart.length || !user) return;
    setIsLoading(true);

    const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const deliveryFee = subtotal > 0 && subtotal < 300 ? 50 : 0;
    const total = subtotal + deliveryFee;
    const earnedPoints = Math.floor(total / 100) * 10;

    const { data: orderData, error } = await supabase
      .from("orders")
      .insert([{ user_id: user.id, total_amount: total, status: "pending", notes: orderNotes }])
      .select()
      .single();

    if (error || !orderData) {
      showToast("Failed to place order", "error");
      setIsLoading(false);
      return;
    }

    await supabase.from("order_items").insert(
      cart.map(i => ({ order_id: orderData.id, product_id: i.id, quantity: i.quantity, price_at_time: i.price }))
    );

    for (const item of cart) {
      await supabase.from("products").update({ stock: products.find(p => p.id === item.id)!.stock - item.quantity }).eq("id", item.id);
    }

    const newPoints = (user.loyaltyPoints || 0) + earnedPoints;
    await supabase.from("users").update({ loyalty_points: newPoints }).eq("id", user.id);
    setUser(prev => prev ? { ...prev, loyaltyPoints: newPoints } : null);

    const newReceipt: ReceiptInfo = {
      orderId: orderData.id,
      total,
      status: "pending",
      customerName: user.name,
      customerMobile: user.mobile,
      notes: orderNotes,
      items: [...cart],
      date: new Date()
    };

    setReceipt(newReceipt);
    setOrdersList([newReceipt, ...ordersList]);
    setCart([]);
    setOrderNotes("");
    setActiveTab("orders");
    showToast(`Order placed! +${earnedPoints} points 💧`);
    setIsLoading(false);
  };

  // Computations (lowStockItems removed to fix TS error)
  const adminTotalRev = ordersList.filter(o => o.status === "delivered").reduce((sum, o) => sum + o.total, 0);
  const adminActiveOrders = ordersList.filter(o => !["delivered", "cancelled"].includes(o.status)).length;
  const fulfillmentRate = ordersList.length > 0 ? Math.round((ordersList.filter(o => o.status === "delivered").length / ordersList.length) * 100) : 0;

  const filteredOrders = ordersList.filter(o => orderFilter === "all" || o.status === orderFilter);
  const searchedProducts = products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartDeliveryFee = cartSubtotal > 0 && cartSubtotal < 300 ? 50 : 0;
  const cartTotal = cartSubtotal + cartDeliveryFee;
  const cartItemCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  const getIcon = (status: string) => ({ pending: "🟡", processing: "🔵", out_for_delivery: "🟠", delivered: "🟢", cancelled: "🔴" }[status] || "⚪");

  const getUserStats = (mobile?: string) => {
    if (!mobile) return { orderCount: 0, totalSpent: 0 };
    const userOrders = ordersList.filter(o => o.customerMobile === mobile);
    return {
      orderCount: userOrders.length,
      totalSpent: userOrders.reduce((sum, o) => sum + o.total, 0)
    };
  };

  // ======================= RENDER =======================
  if (!user) {
    return (
      <div className="login-page">
        {toastMsg && <div className="toast-container"><div className={`toast ${toastMsg.type}`}>{toastMsg.msg}</div></div>}

        <div className="login-card">
          <div className="login-logo">
            <div className="logo-icon">💧</div>
            <h1>Aqua Fria</h1>
            <p className="portal-title">Refilling Portal</p>
          </div>

          {isLoginView ? (
            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label>Mobile Number</label>
                <input
                  type="text"
                  className="custom-input"
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  placeholder="09123456789"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  className="custom-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button type="submit" className="flat-button primary login-btn" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Login"}
              </button>
              <p className="toggle-link" onClick={() => setIsLoginView(false)}>
                Don't have an account? <span>Register here</span>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="login-form">
              <div className="form-group"><label>Full Name</label><input type="text" className="custom-input" value={username} onChange={e => setUsername(e.target.value)} required /></div>
              <div className="form-group"><label>Mobile Number</label><input type="tel" className="custom-input" value={mobile} onChange={e => setMobile(e.target.value)} required /></div>
              <div className="form-group"><label>Email (optional)</label><input type="email" className="custom-input" value={email} onChange={e => setEmail(e.target.value)} /></div>
              <div className="form-group"><label>Password</label><input type="password" className="custom-input" value={password} onChange={e => setPassword(e.target.value)} required /></div>
              <button type="submit" className="flat-button primary login-btn" disabled={isLoading}>
                {isLoading ? "Creating Account..." : "Register"}
              </button>
              <p className="toggle-link" onClick={() => setIsLoginView(true)}>
                Already have an account? <span>Login here</span>
              </p>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {toastMsg && <div className="toast-container"><div className={`toast ${toastMsg.type}`}>{toastMsg.msg}</div></div>}

      {/* Receipt Modal */}
      {receipt && (
        <div className="modal-overlay">
          <div className="receipt-card">
            <h2>AQUA FRIA</h2>
            <p className="receipt-subtitle">Order #{receipt.orderId} • {receipt.date.toLocaleDateString()}</p>
            <div className="receipt-items">
              {receipt.items.map(item => (
                <div key={item.id} className="receipt-item">
                  <span>{item.quantity}x {item.name}</span>
                  <span>₱{item.price * item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="receipt-total">
              <span>TOTAL</span>
              <span>₱{receipt.total}</span>
            </div>
            <button className="flat-button primary" onClick={() => setReceipt(null)}>Close Receipt</button>
          </div>
        </div>
      )}

      {/* Customer Profile Modal */}
      {selectedAdminUser && (
        <div className="modal-overlay">
          <div className="receipt-card" style={{ maxWidth: "520px" }}>
            <h2>Customer Profile</h2>
            <div style={{ margin: "1.5rem 0" }}>
              <p><strong>Name:</strong> {selectedAdminUser.name}</p>
              <p><strong>Mobile:</strong> {selectedAdminUser.mobile}</p>
              <p><strong>Orders:</strong> {getUserStats(selectedAdminUser.mobile).orderCount}</p>
              <p><strong>Total Spent:</strong> ₱{getUserStats(selectedAdminUser.mobile).totalSpent}</p>
            </div>
            <button className="flat-button primary" onClick={() => setSelectedAdminUser(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <div className="logo">
            <span className="logo-icon">💧</span>
            <div className="logo-title">
              <span>Aqua Fria</span>
              <span>{user.role === "admin" ? "Admin Panel" : "Customer Portal"}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {user.role === "customer" && <div className="loyalty-badge">💧 {user.loyaltyPoints} Points</div>}
          <button className="user-profile" onClick={handleLogout}>{user.name} • Logout</button>
        </div>
      </header>

      <div className="app-body">
        {/* Desktop Navigation */}
        <nav className={`navigation ${menuOpen ? "open" : ""}`}>
          {user.role === "admin" ? (
            <>
              <a className={activeTab === "store" ? "active" : ""} onClick={() => { setActiveTab("store"); setSearchQuery(""); setMenuOpen(false); }}><span className="nav-icon">🏪</span> Shop</a>
              <a className={activeTab === "overview" ? "active" : ""} onClick={() => { setActiveTab("overview"); setMenuOpen(false); }}><span className="nav-icon">📊</span> Dashboard</a>
              <a className={activeTab === "riders" ? "active" : ""} onClick={() => { setActiveTab("riders"); setMenuOpen(false); }}><span className="nav-icon">🚴</span> Riders</a>
              <a className={activeTab === "orders" ? "active" : ""} onClick={() => { setActiveTab("orders"); setMenuOpen(false); }}><span className="nav-icon">📦</span> Orders</a>
              <a className={activeTab === "inventory" ? "active" : ""} onClick={() => { setActiveTab("inventory"); setSearchQuery(""); setMenuOpen(false); }}><span className="nav-icon">📦</span> Inventory</a>
              <a className={activeTab === "users" ? "active" : ""} onClick={() => { setActiveTab("users"); setSearchQuery(""); setMenuOpen(false); }}><span className="nav-icon">👥</span> Customers</a>
              <a className={activeTab === "settings" ? "active" : ""} onClick={() => { setActiveTab("settings"); setMenuOpen(false); }}><span className="nav-icon">⚙️</span> Settings</a>
            </>
          ) : (
            <>
              <a className={activeTab === "store" ? "active" : ""} onClick={() => { setActiveTab("store"); setSearchQuery(""); setMenuOpen(false); }}><span className="nav-icon">🏪</span> Shop {cartItemCount > 0 && <span className="nav-badge">{cartItemCount}</span>}</a>
              <a className={activeTab === "orders" ? "active" : ""} onClick={() => { setActiveTab("orders"); setMenuOpen(false); }}><span className="nav-icon">📦</span> My Orders</a>
            </>
          )}
        </nav>

        {/* Main Content */}
        <main className="service-section">
          {/* Store View - Available to both customer and admin */}
          {activeTab === "store" && (
            <>
              <div className="store-hero">
                <div className="store-hero-map">
                  <iframe src={shopLocationUrl} title="Location" loading="lazy" />
                </div>
                <div className="store-hero-info">
                  <div className="live-status">● Accepting Orders</div>
                  <h1>Serving Dumaguete City</h1>
                  <p>Earn 10 points per ₱100 spent</p>
                </div>
              </div>

              <h2 className="section-title">Available Products</h2>
              <input type="text" className="search-bar" placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />

              <div className="tiles">
                {searchedProducts.map(p => (
                  <div key={p.id} className="tile">
                    {p.stock <= 10 && p.stock > 0 && <div className="stock-badge stock-low">Only {p.stock} left</div>}
                    {p.stock === 0 && <div className="stock-badge stock-out">Out of Stock</div>}
                    <h3>{p.name}</h3>
                    <div className="price">₱{p.price}</div>
                    <button className="flat-button primary" onClick={() => handleCart(p, 1)} disabled={p.stock === 0 || user.role === "admin"}>
                      {p.stock === 0 ? "Out of Stock" : user.role === "admin" ? "Admin View" : "Add to Cart"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Admin Overview */}
          {user.role === "admin" && activeTab === "overview" && (
            <div>
              <h2 className="section-title">Dashboard</h2>
              <div className="stats-grid">
                <div className="stat-card"><span className="value">₱{adminTotalRev.toLocaleString()}</span><span>Total Revenue</span></div>
                <div className="stat-card"><span className="value">{adminActiveOrders}</span><span>Active Orders</span></div>
                <div className="stat-card"><span className="value">{fulfillmentRate}%</span><span>Fulfillment Rate</span></div>
              </div>
            </div>
          )}

          {/* Admin Inventory */}
          {user.role === "admin" && activeTab === "inventory" && (
            <div>
              <h2 className="section-title">Inventory</h2>
              <input type="text" className="search-bar" placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <div className="tiles">
                {searchedProducts.map(p => (
                  <div key={p.id} className="tile">
                    <h3>{p.name}</h3>
                    <p>₱{p.price} • Stock: {p.stock}</p>
                    <div className="tile-actions">
                      <button className="flat-button" onClick={() => { setProductName(p.name); setProductPrice(p.price); setProductStock(p.stock); setEditProductId(p.id); }}>Edit</button>
                      <button className="flat-button danger" onClick={() => setConfirmDeleteProduct(p.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin Riders */}
          {user.role === "admin" && activeTab === "riders" && (
            <div>
              <h2 className="section-title">Riders Management</h2>
              <div className="transfers">
                {riders.length === 0 ? (
                  <p>No riders registered yet.</p>
                ) : (
                  riders.map(rider => (
                    <div key={rider.id} className="transfer">
                      <div className="transfer-logo">🚴</div>
                      <div className="transfer-details">
                        <div><strong>{rider.name}</strong></div>
                        <div>{rider.mobile}</div>
                        <div><small>{rider.email || "No email"}</small></div>
                      </div>
                      <div className="transfer-number">
                        <button 
                          className={`flat-button ${rider.status === "active" ? "primary" : ""}`}
                          onClick={() => toggleRiderStatus(rider.id, rider.status)}
                          style={{ marginBottom: "8px" }}
                        >
                          {rider.status === "active" ? "Active" : "Inactive"}
                        </button>
                        <button className="flat-button danger" onClick={() => setConfirmDeleteRider(rider.id)}>Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Admin Users */}
          {user.role === "admin" && activeTab === "users" && (
            <div>
              <h2 className="section-title">Customers</h2>
              <input type="text" className="search-bar" placeholder="Search customers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <div className="transfers">
                {registeredUsers
                  .filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.mobile.includes(searchQuery))
                  .map(u => (
                    <div key={u.id} className="transfer" style={{ cursor: "pointer" }} onClick={() => setSelectedAdminUser(u)}>
                      <div className="transfer-logo">👤</div>
                      <div className="transfer-details">
                        <div><strong>{u.name}</strong></div>
                        <div>{u.mobile}</div>
                      </div>
                      <div className="transfer-number">₱{getUserStats(u.mobile).totalSpent}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Admin Orders */}
          {user.role === "admin" && activeTab === "orders" && (
            <div>
              <h2 className="section-title">Orders</h2>
              <div className="filter-pills">
                {["all", "pending", "processing", "out_for_delivery", "delivered"].map(f => (
                  <button key={f} className={`filter-pill ${orderFilter === f ? "active" : ""}`} onClick={() => setOrderFilter(f as any)}>
                    {f.replace("_", " ").toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="transfers">
                {filteredOrders.length === 0 ? (
                  <p>No orders found.</p>
                ) : (
                  filteredOrders.map(order => (
                    <div key={order.orderId} className="transfer">
                      <div className="transfer-logo">{getIcon(order.status)}</div>
                      <div className="transfer-details">
                        <div><strong>Order #{order.orderId}</strong></div>
                        <div>{order.customerName} • {order.customerMobile}</div>
                        <div>
                          <select value={order.driver || "Unassigned"} onChange={e => updateOrderStatus(order.orderId, order.status, e.target.value)} style={{ padding: "4px" }}>
                            <option value="Unassigned">Unassigned</option>
                            {riders.filter(r => r.status === "active").map(r => (
                              <option key={r.id} value={r.name}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="transfer-number">
                        ₱{order.total}
                        {order.status === "pending" && <button className="flat-button primary" style={{ marginTop: "8px" }} onClick={() => handleQuickAction(order.orderId, order.status)}>Accept</button>}
                        {order.status === "processing" && <button className="flat-button" style={{ marginTop: "8px" }} onClick={() => handleQuickAction(order.orderId, order.status)}>Dispatch</button>}
                        {order.status === "out_for_delivery" && <button className="flat-button" style={{ marginTop: "8px" }} onClick={() => handleQuickAction(order.orderId, order.status)}>Delivered</button>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Admin Settings */}
          {user.role === "admin" && activeTab === "settings" && (
            <div className="cart-card">
              <h2>System Settings</h2>
              <form onSubmit={async (e) => { e.preventDefault(); await supabase.from("settings").upsert({ key: "shop_location", value: editLocationUrl }, { onConflict: "key" }); setShopLocationUrl(editLocationUrl); showToast("Map updated!"); }}>
                <div className="form-group">
                  <label>Google Maps Embed URL</label>
                  <input type="url" className="custom-input" value={editLocationUrl} onChange={e => setEditLocationUrl(e.target.value)} />
                </div>
                <button type="submit" className="flat-button primary">Update Map</button>
              </form>
            </div>
          )}

          {/* Customer Orders */}
          {user.role === "customer" && activeTab === "orders" && (
            <div>
              <h2 className="section-title">Orders</h2>
              <div className="transfers">
                {ordersList.length === 0 ? <p>No orders yet.</p> : ordersList.map(order => (
                  <div key={order.orderId} className="transfer">
                    <div className="transfer-logo">{getIcon(order.status)}</div>
                    <div className="transfer-details">
                      <div>Order #{order.orderId}</div>
                      <div>{order.date.toLocaleDateString()}</div>
                      <div>Driver: {order.driver || "Pending"}</div>
                    </div>
                    <div className="transfer-number">
                      ₱{order.total}
                      <button className="flat-button" style={{ marginTop: "8px" }} onClick={() => setReceipt(order)}>Receipt</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside className="app-body-sidebar">
          {user.role === "admin" && activeTab === "inventory" && (
            <div className="cart-card">
              <h2>{editProductId ? "Edit Product" : "Add Product"}</h2>
              <form onSubmit={handleSaveProduct}>
                <div className="form-group"><label>Name</label><input type="text" className="custom-input" value={productName} onChange={e => setProductName(e.target.value)} required /></div>
                <div className="form-group"><label>Price (₱)</label><input type="number" className="custom-input" value={productPrice} onChange={e => setProductPrice(Number(e.target.value))} required /></div>
                <div className="form-group"><label>Stock</label><input type="number" className="custom-input" value={productStock} onChange={e => setProductStock(Number(e.target.value))} required /></div>
                <button type="submit" className="flat-button primary" disabled={isLoading}>Save Product</button>
              </form>
            </div>
          )}

          {user.role === "admin" && activeTab === "riders" && (
            <div className="cart-card">
              <h2>Register Rider</h2>
              <form onSubmit={handleAddRider}>
                <div className="form-group"><label>Full Name</label><input type="text" className="custom-input" value={riderName} onChange={e => setRiderName(e.target.value)} required /></div>
                <div className="form-group"><label>Mobile Number</label><input type="tel" className="custom-input" value={riderMobile} onChange={e => setRiderMobile(e.target.value)} required /></div>
                <div className="form-group"><label>Email (optional)</label><input type="email" className="custom-input" value={riderEmail} onChange={e => setRiderEmail(e.target.value)} /></div>
                <button type="submit" className="flat-button primary" disabled={isLoading}>Register Rider</button>
              </form>
            </div>
          )}

          {user.role === "customer" && activeTab === "store" && (
            <div className="cart-card">
              <h2>Your Cart ({cartItemCount})</h2>
              {cart.length === 0 ? (
                <p>Your cart is empty</p>
              ) : (
                <>
                  <div className="cart-items">
                    {cart.map(item => (
                      <div key={item.id} className="cart-item">
                        <div>
                          <strong>{item.name}</strong><br />
                          <small>₱{item.price} × {item.quantity}</small>
                        </div>
                        <div className="cart-controls">
                          <button onClick={() => handleCart(item, -1)}>-</button>
                          <span>{item.quantity}</span>
                          <button onClick={() => handleCart(item, 1)}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="form-group">
                    <label>Delivery Notes</label>
                    <textarea className="custom-input" value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Leave at gate..." />
                  </div>

                  <div className="cart-summary">
                    <div>Subtotal: ₱{cartSubtotal}</div>
                    <div>Delivery: {cartDeliveryFee === 0 ? "FREE" : `₱${cartDeliveryFee}`}</div>
                    <div className="total">Total: ₱{cartTotal}</div>
                  </div>

                  <button className="flat-button primary" onClick={handlePlaceOrder} disabled={isLoading}>
                    {isLoading ? "Processing..." : "Place Order"}
                  </button>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Confirm Modal */}
      {(confirmDeleteProduct || confirmCancelOrder || confirmDeleteRider) && (
        <div className="modal-overlay">
          <div className="confirm-card">
            <h3>Are you sure?</h3>
            <p>This action cannot be undone.</p>
            <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
              <button className="flat-button" onClick={() => { setConfirmDeleteProduct(null); setConfirmCancelOrder(null); setConfirmDeleteRider(null); }}>Cancel</button>
              <button className="flat-button danger" onClick={confirmDeleteProduct ? handleDeleteProduct : confirmCancelOrder ? handleCancelOrder : handleDeleteRider}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}