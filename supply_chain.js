// 🆕 ENDPOINT: Register a New Part & Initialize Starting Balances
app.post('/api/inventory/create-part', async (req, res) => {
    try {
        const { 
            sku, 
            partName, 
            description, 
            unitCost, 
            retailPrice, 
            minimumStockLevel, 
            initialWarehouseId, 
            initialQty 
        } = req.body;

        if (!sku || !partName || unitCost === undefined || retailPrice === undefined) {
            return res.status(400).json({ error: "Missing required core product metadata parameters." });
        }

        let pool = await sql.connect(dbConfig);
        
        let transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            let partRequest = new sql.Request(transaction);
            partRequest.input('sku', sql.VarChar, sku);
            partRequest.input('partName', sql.VarChar, partName);
            partRequest.input('description', sql.VarChar, description || "");
            partRequest.input('unitCost', sql.Decimal(18, 2), unitCost);
            partRequest.input('retailPrice', sql.Decimal(18, 2), retailPrice);
            partRequest.input('minStock', sql.Int, minimumStockLevel || 10);

            let partResult = await partRequest.query(`
                INSERT INTO Parts (SKU, Name, Description, UnitCost, RetailPrice, MinimumStockLevel)
                OUTPUT INSERTED.PartID
                VALUES (@sku, @partName, @description, @unitCost, @retailPrice, @minStock);
            `);

            const newPartId = partResult.recordset[0].PartID;

            if (initialWarehouseId && initialQty !== undefined) {
                let balanceRequest = new sql.Request(transaction);
                balanceRequest.input('partId', sql.Int, newPartId);
                balanceRequest.input('warehouseId', sql.Int, initialWarehouseId);
                balanceRequest.input('qty', sql.Int, initialQty);

                await balanceRequest.query(`
                    INSERT INTO InventoryBalances (PartID, WarehouseID, BinLocation, QuantityOnHand)
                    VALUES (@partId, @warehouseId, 'RECEIVING-DOCK', @qty);
                `);

                let logRequest = new sql.Request(transaction);
                logRequest.input('partId', sql.Int, newPartId);
                logRequest.input('warehouseId', sql.Int, initialWarehouseId);
                logRequest.input('qty', sql.Int, initialQty);

                await logRequest.query(`
                    INSERT INTO StockTransactions (PartID, WarehouseID, QuantityChanged, TransactionType, Timestamp)
                    VALUES (@partId, @warehouseId, @qty, 'INITIAL_INTAKE', GETDATE());
                `);
            }

            await transaction.commit();
            res.json({ success: true, message: "Asset profile and pricing structure initialized.", partId: newPartId });

        } catch (innerErr) {
            await transaction.rollback();
            throw innerErr;
        }

    } catch (err) {
        console.error("Asset onboarding processing failure:", err.message);
        res.status(500).json({ error: "Failed to create parts allocation record." });
    }
});

// 📦 ENDPOINT: Fast-Scan Stock Reduction (Picking)
app.post('/api/inventory/scan-decrement', async (req, res) => {
    try {
        const { barcode, warehouseId } = req.body;

        if (!barcode || !warehouseId) {
            return res.status(400).json({ error: "Missing barcode or warehouseId parameters." });
        }

        let pool = await sql.connect(dbConfig);
        
        let transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. Find the Part ID linked to that barcode string (Fixed to explicitly use transaction request context)
            let partRequest = new sql.Request(transaction);
            partRequest.input('barcode', sql.VarChar, barcode);
            let partResult = await partRequest.query("SELECT PartID FROM Parts WHERE BarcodeValue = @barcode");
            
            if (partResult.recordset.length === 0) {
                throw new Error("Barcode not registered in master database.");
            }
            const partId = partResult.recordset[0].PartID;

            // 2. Deduct exactly 1 unit from the warehouse balance
            let updateRequest = new sql.Request(transaction);
            updateRequest.input('partId', sql.Int, partId);
            updateRequest.input('warehouseId', sql.Int, warehouseId);
            await updateRequest.query(`
                UPDATE InventoryBalances 
                SET QuantityOnHand = QuantityOnHand - 1 
                WHERE PartID = @partId AND WarehouseID = @warehouseId
            `);

            // 3. Log the transaction to the audit history table
            let logRequest = new sql.Request(transaction);
            logRequest.input('partId', sql.Int, partId);
            logRequest.input('warehouseId', sql.Int, warehouseId);
            await logRequest.query(`
                INSERT INTO StockTransactions (PartID, WarehouseID, QuantityChanged, TransactionType, Timestamp)
                VALUES (@partId, @warehouseId, -1, 'SCAN_OUT', GETDATE())
            `);

            await transaction.commit();
            res.json({ success: true, message: "Item successfully scanned out of inventory." });

        } catch (innerErr) {
            await transaction.rollback();
            throw innerErr;
        }

    } catch (err) {
        console.error("Scan processing failure:", err.message);
        res.status(400).json({ error: err.message });
    }
});

// Frontend JavaScript: Fetch and render live Azure inventory data
async function loadDashboard() {
    const response = await fetch('http://localhost:5000/api/inventory/low-stock'); // Your endpoint!
    const items = await response.json();
    
    const tableBody = document.getElementById('inventory-rows');
    tableBody.innerHTML = ''; // Clear old rows
    
    items.forEach(item => {
        tableBody.innerHTML += `
            <tr>
                <td><strong>${item.SKU}</strong></td>
                <td>${item.Name}</td>
                <td>${item.QuantityOnHand} units</td>
                <td>
                    <button class="btn-pick" onclick="adjustStock(${item.PartID}, ${item.WarehouseID})">
                        ⚡ Pick 1 Unit
                    </button>
                </td>
            </tr>
        `;
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Inventory Engine active on port ${PORT}`));

    app.use(cors({ origin: 'https://your-frontend-domain.com' }));
}