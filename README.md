Global Inventory & Warehouse Manager
This project is a live digital command center that gives business managers a overview of their entire inventory. It connects  interactive visual dashboard to a live cloud database to ensure that stock levels are perfectly accurate across multiple real-world facilities
⚡ What This App Does (Core Features)
    Real-Time Financial Pulse: Automatically calculates the total cash value of all products currently sitting in your warehouses, so executives always know their on-hand asset value.
    
    Smart Low-Stock Alerts: Automatically highlights items in red and flags them as a "Critical Level" the exact moment stock drops below safety thresholds.
    
    Interactive Data Charting: Built-in visual bar graphs that dynamically adjust instantly as stock levels change, helping managers see which warehouses are packed and which are running empty.
    
    Single-Click Actions: Features a "Pick" button to simulate scanning an item out for a customer delivery, and a "Restock" button that automatically orders more units from suppliers.
    
    Fail-Safe Guardrails: Built with strict background safety rules. The system physically prevents an employee from "picking" an item if the inventory count is at zero, completely wiping out human bookkeeping errors.

🗺️ How It Works Behind the Scenes

    The Dashboard (The Counter): This is the visual screen you see in the browser. It displays the clean lists, colorful badges, and graphs for the warehouse workers.
      
    The Server (The Manager): When you click a button (like "Pick"), the dashboard asks the server to handle the request. The server double-checks the math and makes sure the request is valid.
      
    The Cloud Database (The Master Ledger): A live, secured database hosted on Microsoft Azure cloud servers. It acts as the ultimate source of truth, storing every single product, its price, and its location securely.

📦 The Warehouse Blueprint (Data Structure)
      
      The system organizes information into three simple, interconnected digital filing cabinets:
        
      The Product Catalog (partstable): Stores basic details about what you sell (The item's name, its unique barcode/SKU, its price, and the minimum safety stock level).
        
      The Location Sheet (inventorybalancestable): Tracks exactly where those products live (e.g., Is it in the Detroit Plant or the Chicago Hub? Which shelf or aisle is it on? How many are left?).
        
      The Audit Ledger (stocktransactions): An unchangeable history book. Every single time a button is clicked, it stamps a record of exactly what happened, when, and why, creating a perfect paper trail for company auditors.

🛠️ How to Run This Project Locally
      If you want to download this project and run it on your own computer, follow these quick steps:
      
      Download the code repository:
      
      Bash
      git clone https://github.com/yourusername/global-inventory-manager.git
      cd global-inventory-manager
      Install the project engine:
      
      Bash
      npm install
      Set up your connection key:
      Create a small text file named .env in the project's root folder and paste your secure database login link inside it:
      
      Code snippet
      PORT=8080
      DATABASE_URL=your_secret_database_link_goes_here
      Launch the app:
      
      Bash
      npm start
      Now, open your web browser and type http://localhost:8080 into the address bar to open your brand-new inventory system!
