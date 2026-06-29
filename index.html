<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Warehouse Inventory Dashboard</title>
    <style>
        body { font-family: sans-serif; background-color: #121212; color: #ffffff; padding: 20px; }
        .dashboard-container { max-width: 1000px; margin: 0 auto; }
        
        /* Fixed Header and Data Alignment Grid */
        .inventory-grid-header, .inventory-grid-row {
            display: grid;
            /* Expanded grid template to perfectly space out 8 columns */
            grid-template-columns: 1.2fr 2fr 1.2fr 1fr 1fr 1fr 1.5fr 1.2fr;
            align-items: center;
            padding: 12px;
            border-bottom: 1px solid #292929;
        }
        .inventory-grid-header { background-color: #1e1e1e; font-weight: bold; color: #b3b3b3; }
        .inventory-grid-row:hover { background-color: #1a1a1a; }
        
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge-danger { background-color: #7a1c1c; color: #ff9999; }
        
        /* Admin Form Layout */
        .admin-panel { background-color: #1e1e1e; padding: 20px; border-radius: 6px; margin-top: 30px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; color: #b3b3b3; }
        .form-group input { background: #2d2d2d; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; width: 200px; }
        button { background-color: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        button:hover { background-color: #1d4ed8; }
        .btn-pick { background-color: #eab308; color: #000; font-weight: bold; }
        .btn-pick:hover { background-color: #ca8a04; }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <h2>Warehouse Inventory Dashboard</h2>
        <p>Critical Low-Stock Alerts</p>

        <div class="inventory-grid-header">
            <div>SKU</div>
            <div>NAME</div>
            <div>MATERIAL</div>
            <div>PRICE</div>
            <div>LOCATION</div>
            <div>ON HAND</div>
            <div>LAST CHECKOUT</div>
            <div>ACTION</div>
        </div>

        <div id="inventory-data-target">
            </div>

        <div class="admin-panel">
            <h3>Structural Key Management</h3>
            <p style="font-size: 13px; color: #aaa;">Update underlying database primary keys and target locations dynamically.</p>
            
            <div style="display: flex; gap: 20px;">
                <div class="form-group">
                    <label>Target Part ID</label>
                    <input type="number" id="target-part-id" value="1">
                </div>
                <div class="form-group">
                    <label>New System Part ID</label>
                    <input type="number" id="new-part-id" placeholder="e.g. 5">
                </div>
                <div class="form-group">
                    <label>New Warehouse ID</label>
                    <input type="number" id="new-warehouse-id" placeholder="e.g. 202">
                </div>
            </div>
            <button onclick="updateSystemIdentifiers()">⚡ Update System Keys</button>
        </div>
    </div>

    <script>
        // Fetch and display database elements seamlessly
        async function loadDashboard() {
            try {
                let dataset = [
                    {
                        "partid": 1,
                        "sku": "SKU-AZURE-PRO",
                        "name": "Cloud Processing Core Unit",
                        "material_name": "Aerospace-Grade Aluminum",
                        "retailprice": "149.99",
                        "warehouseid": 101,
                        "binlocation": "ZONE-A-BIN-7",
                        "quantityonhand": 2
                    },
                    {
                        "partid": 2,
                        "sku": "SKU-AZURE-NODE",
                        "name": "Edge Routing Controller",
                        "material_name": "High-Density Polyethylene",
                        "retailprice": "89.50",
                        "warehouseid": 101,
                        "binlocation": "ZONE-B-BIN-3",
                        "quantityonhand": 4
                    },
                    {
                        "partid": 3,
                        "sku": "SKU-AZURE-THERM",
                        "name": "Thermal Regulation Sink",
                        "material_name": "Anodized Copper",
                        "retailprice": "210.00",
                        "warehouseid": 101,
                        "binlocation": "ZONE-C-BIN-12",
                        "quantityonhand": 1
                    },
                    {
                        "partid": 4,
                        "sku": "SKU-AZURE-PWR",
                        "name": "Solid State Power Module",
                        "material_name": "Silicon Carbide",
                        "retailprice": "345.25",
                        "warehouseid": 101,
                        "binlocation": "ZONE-A-BIN-1",
                        "quantityonhand": 8
                    }
                ];
        
                const response = await fetch('/api/inventory/low-stock');
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        dataset = data;
                    } else {
                        console.warn("API did not return an array. Using fallback data.", data);
                    }
                } else {
                    console.warn("Server error received. Falling back to local dataset.");
                }
        
                const container = document.getElementById('inventory-data-target');
                container.innerHTML = ''; 

                dataset.forEach(item => {
                    // Extracting keys safely regardless of backend case-sensitivity (CamelCase vs Lowercase)
                    const sku = item.sku || item.SKU || '—';
                    const name = item.name || item.Name || '—';
                    const material = item.material_name || item.MaterialName || 'Standard';
                    const price = item.retailprice || item.RetailPrice || 0;
                    const bin = item.binlocation || item.BinLocation || 'UNASSIGNED';
                    const qty = item.quantityonhand !== undefined ? item.quantityonhand : (item.QuantityOnHand !== undefined ? item.QuantityOnHand : 0);
                    const pId = item.partid || item.PartID;
                    const wId = item.warehouseid || item.WarehouseID || 101;

                    const checkoutDate = item.DateCheckedOut || item.datecheckedout
                                    ? new Date(item.DateCheckedOut || item.datecheckedout).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) 
                                    : '—';

                    const row = document.createElement('div');
                    row.className = 'inventory-grid-row';
                    row.innerHTML = `
                        <div style="font-weight: bold;">${sku}</div>
                        <div>${name}</div>
                        <div style="color: #ca8a04;">${material}</div>
                        <div style="color: #4ade80; font-weight: bold;">$${parseFloat(price).toFixed(2)}</div>
                        <div style="color: #888; font-size: 13px;">${bin}</div>
                        <div>${qty} units</div>
                        <div style="font-size: 13px; color: #a3a3a3;">${checkoutDate}</div>
                        <div>
                            <button class="btn-pick" onclick="executeStockPick(${pId}, ${wId})">
                                ⚡ Pick 1 Unit
                            </button>
                        </div>
                    `;
                    container.appendChild(row);
                });
            } catch (err) {
                console.error("Failed to extract active dataset:", err);
            }
        }

        // Action Route for handling inventory pickups cleanly
        async function executeStockPick(partId, warehouseId) {
            if (!partId || !warehouseId) {
                console.error("Cannot execute pick transaction: Missing structural parameters.", { partId, warehouseId });
                return;
            }
            try {
                const response = await fetch('/api/inventory/adjust', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        partId: parseInt(partId),
                        warehouseId: parseInt(warehouseId),
                        quantityChanged: -1,
                        transactiontype: 'PICK'
                    })
                });

                if (response.ok) {
                    loadDashboard(); // Refresh UI values instantly
                } else {
                    console.error("Server rejected inventory deduction parameters.");
                }
            } catch (error) {
                console.error("Network interface error:", error);
            }
        }

        // Push primary key changes downstream to your transaction endpoint
        async function updateSystemIdentifiers() {
            const targetPartId = document.getElementById('target-part-id').value;
            const newPartId = document.getElementById('new-part-id').value;
            const newWarehouseId = document.getElementById('new-warehouse-id').value;

            if (!targetPartId || !newPartId || !newWarehouseId) {
                alert("Please declare all target identities before updating structural keys.");
                return;
            }

            try {
                const response = await fetch('/api/inventory/update-keys', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        oldPartId: parseInt(targetPartId),
                        oldWarehouseId: 101, // default baseline seed value
                        newPartId: parseInt(newPartId),
                        newWarehouseId: parseInt(newWarehouseId)
                    })
                });

                const status = await response.json();
                if (status.success) {
                    alert("Database relational schemas altered successfully!");
                    document.getElementById('target-part-id').value = newPartId;
                    loadDashboard();
                } else {
                    alert("Structural mutation rejected by Postgres layer.");
                }
            } catch (err) {
                console.error("Network communication breakdown:", err);
            }
        }

        // Initialize dashboard assets immediately on document load
        window.onload = loadDashboard;
    </script>
</body>
</html>
