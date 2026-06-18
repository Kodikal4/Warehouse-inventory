const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
require('dotenv').config();

// 🌐 Production CORS: Open up for development or lock to your exact azure domain
app.use(cors({ origin: '*' })); 
app.use(express.json());

// 🔐 Azure SQL Database Connection Configuration
const dbConfig = {
    // 🖥️ Aligns with DB_SERVER in your portal
    server: 'superman4-server.database.windows.net', 
    
    // 📂 Aligns with WAREHOUSE_SQL_DATABASE in your portal
    database: 'superman4',
    
    // 👤 Aligns with DB_USER in your portal (Falls back to 'postgres' if missing)
    user: 'postgres',
    
    // 🔐 Aligns with your saved portal password keys
    password: 'postgre4231',

    port: 1433,
    options: {
        encrypt: true, // Required for Azure SQL Server connections
        trustServerCertificate: false
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

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
// Note: Handled via PartID/WarehouseID query matching to support your front-end button structure
app.post('/api/inventory/pick', async (req, res) => {
    try {
        const { partId, warehouseId } = req.body;

        if (!partId || !warehouseId) {
            return res.status(400).json({ error: "Missing partId or warehouseId parameters." });
        }

        let pool = await sql.connect(dbConfig);
        let transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            let updateRequest = new sql.Request(transaction);
            updateRequest.input('partId', sql.Int, partId);
            updateRequest.input('warehouseId', sql.Int, warehouseId);
            await updateRequest.query(`
                UPDATE InventoryBalances 
                SET QuantityOnHand = QuantityOnHand - 1 
                WHERE PartID = @partId AND WarehouseID = @warehouseId
            `);

            let logRequest = new sql.Request(transaction);
            logRequest.input('partId', sql.Int, partId);
            logRequest.input('warehouseId', sql.Int, warehouseId);
            await logRequest.query(`
                INSERT INTO StockTransactions (PartID, WarehouseID, QuantityChanged, TransactionType, Timestamp)
                VALUES (@partId, @warehouseId, -1, 'PICK_SHORT', GETDATE())
            `);

            await transaction.commit();
            res.json({ success: true, message: "Item successfully decremented from inventory matrix." });

        } catch (innerErr) {
            await transaction.rollback();
            throw innerErr;
        }

    } catch (err) {
        console.error("Pick processing failure:", err.message);
        res.status(400).json({ error: err.message });
    }
});

// 📉 ENDPOINT: Fetch Low Stock Alerts
app.get('/api/inventory/low-stock', async (_req, res) => {
    try {
        // ✅ Added critical 'await' keyword here to prevent runtime engine crash
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT p.PartID, p.SKU, p.Name, b.QuantityOnHand, b.WarehouseID
            FROM Parts p
            JOIN InventoryBalances b ON p.PartID = b.PartID
            WHERE b.QuantityOnHand <= p.MinimumStockLevel
        `);

        console.log(`Successfully fetched ${result.recordset.length} low-stock inventory items.`);
        
        res.json(result.recordset);
    } catch (err) {
        console.error("Failed to fetch low stock alerts:", err.message);
        res.status(500).json({ error: "Internal database query failure." });
    }
});

// 📂 Serve Static Frontend Files with Absolute Pathing
const path = require('path');
app.use(express.static(path.join(__dirname, '.')));

// Fallback catch-all route to explicitly stream index.html if a user hits the base URL
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 🚀 Express initialization
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Inventory Engine active on port ${PORT}`));