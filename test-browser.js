const puppeteer = require('puppeteer');

async function testProductsPage() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  try {
    // Go to login page first
    console.log('Navigating to login...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Check if login form exists
    await page.waitForSelector('input[type="text"], input[name="username"]', { timeout: 10000 });
    console.log('Login page loaded');
    
    // Try to login with default credentials (if any)
    // First check if there's a test user
    await page.type('input[type="text"], input[name="username"]', 'testuser');
    await page.type('input[type="password"]', 'test123456');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    console.log('Login attempted');
    
    // Go to products page
    console.log('Navigating to products...');
    await page.goto('http://localhost:5173/products', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for table to load
    await page.waitForSelector('table, .data-table', { timeout: 10000 });
    console.log('Products page loaded');
    
    // Check for "Tanggal Beli" column header
    const headers = await page.$$eval('th', els => els.map(el => el.textContent.trim()));
    console.log('Table headers:', headers);
    
    const hasTanggalBeli = headers.some(h => h.includes('Tanggal Beli') || h.includes('Tanggal'));
    console.log('Has "Tanggal Beli" column:', hasTanggalBeli);
    
    // Check table rows for purchase_date data
    const rows = await page.$$eval('tbody tr', els => els.map(el => el.textContent.trim()));
    console.log('Table rows (first 3):', rows.slice(0, 3));
    
    // Test opening add product modal
    const addBtn = await page.$('button[aria-label="Tambah produk"]');
    if (!addBtn) {
      // Try finding by text content
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes('Tambah')) {
          addBtn = btn;
          break;
        }
      }
    }
    if (addBtn) {
      console.log('Clicking add button...');
      
      // Try clicking via JavaScript to ensure Vue handler fires
      await page.evaluate(btn => btn.click(), addBtn);
      
      // Wait for modal to appear - try multiple selectors
      let modalFound = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const dateInput = await page.$('input[type="date"]');
        if (dateInput) {
          modalFound = true;
          console.log('Modal appeared after', (i+1)*500, 'ms');
          break;
        }
      }
      
      if (!modalFound) {
        console.log('Modal did not appear, checking Vue devtools...');
        const bodyHTML = await page.$eval('body', el => el.innerHTML);
        console.log('Body HTML (first 3000 chars):', bodyHTML.substring(0, 3000));
      }
      
      // Check for purchase_date field
      const dateInput = await page.$('input[type="date"]');
      console.log('Date input found:', !!dateInput);
      
      if (!dateInput) {
        // List all inputs
        const inputs = await page.$$eval('input', els => els.map(el => ({ type: el.type, name: el.name, placeholder: el.placeholder })));
        console.log('All inputs:', inputs);
      }
      
      // Debug: list all form inputs in modal
      const modalInputs = await page.$$eval('input', els => els.map(el => ({ type: el.type, name: el.name, placeholder: el.placeholder, class: el.className })));
      console.log('All inputs in modal:', modalInputs);
      
      // Fill form and submit - use placeholder-based selectors
      // Input 1: Nama produk (placeholder: "Nama produk")
      await page.type('input[placeholder="Nama produk"]', 'Test Produk Browser');
      // Input 2: SKU (placeholder: "Kode produk / barcode")
      await page.type('input[placeholder="Kode produk / barcode"]', 'TEST-001');
      // Input 3: Harga Beli (first "0" placeholder)
      // Input 4: Harga Jual (second "0" placeholder)
      // Input 5: Harga Mitra (third "0" placeholder)
      const priceInputs = await page.$$('input[placeholder="0"]');
      console.log('Price inputs count:', priceInputs.length);
      if (priceInputs.length >= 3) {
        await priceInputs[0].type('5000');  // Harga Beli
        await priceInputs[1].type('10000'); // Harga Jual
        await priceInputs[2].type('8000');  // Harga Mitra
      }
      
      // Also set values via Vue reactivity to ensure validation passes
      await page.evaluate(() => {
        const nameInput = document.querySelector('input[placeholder="Nama produk"]');
        const skuInput = document.querySelector('input[placeholder="Kode produk / barcode"]');
        const priceInputs = document.querySelectorAll('input[placeholder="0"]');
        if (nameInput) { nameInput.value = 'Test Produk Browser'; nameInput.dispatchEvent(new Event('input', { bubbles: true })); }
        if (skuInput) { skuInput.value = 'TEST-001'; skuInput.dispatchEvent(new Event('input', { bubbles: true })); }
        if (priceInputs.length >= 3) {
          priceInputs[0].value = '5000'; priceInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          priceInputs[1].value = '10000'; priceInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
          priceInputs[2].value = '8000'; priceInputs[2].dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      
      // Set purchase date to today
      const today = new Date().toISOString().split('T')[0];
      await page.evaluate((date) => {
        const input = document.querySelector('input[type="date"]');
        if (input) input.value = date;
      }, today);
      console.log('Set purchase_date to:', today);
      
      // Submit - find button with "Simpan" or "Submit" text inside modal
      const modalButtons = await page.$$('[role="dialog"] button, .modal button, .fixed.inset-0 button');
      console.log('Modal buttons:', await Promise.all(modalButtons.map(async btn => await page.evaluate(el => el.textContent, btn))));
      console.log('Modal buttons HTML:', await Promise.all(modalButtons.map(async btn => await page.evaluate(el => el.outerHTML, btn))));
      let submitBtn = null;
      for (const btn of modalButtons) {
        const text = await page.evaluate(el => el.textContent, btn);
        const html = await page.evaluate(el => el.outerHTML, btn);
        if (text && (text.includes('Simpan') || text.includes('Submit') || text.includes('Tambah'))) {
          submitBtn = btn;
          break;
        }
        // Check if button has SVG or child with text
        if (html.includes('Simpan') || html.includes('Submit') || html.includes('Tambah') || html.includes('Save')) {
          submitBtn = btn;
          break;
        }
      }
      if (submitBtn) {
        console.log('Clicking submit button...');
        await submitBtn.click();
        
        // Wait for potential error messages or success
        await new Promise(r => setTimeout(r, 3000));
        
        // Check for error messages
        const errorMsgs = await page.$$eval('.text-red-500, .bg-red-100, [role="alert"]', els => els.map(el => el.textContent.trim()));
        console.log('Error messages:', errorMsgs);
        
        // Check if modal is still open
        const modalStillOpen = await page.$('[role="dialog"], .modal, .fixed.inset-0');
        console.log('Modal still open:', !!modalStillOpen);
        
        console.log('Product submitted');
      } else {
        console.log('Submit button not found in modal');
        // Try all buttons again
        const allButtons = await page.$$('button');
        console.log('All buttons:', await Promise.all(allButtons.map(async btn => await page.evaluate(el => el.textContent, btn))));
        console.log('All buttons HTML:', await Promise.all(allButtons.map(async btn => await page.evaluate(el => el.outerHTML, btn))));
      }
      
      // Reload and check
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForSelector('table, .data-table', { timeout: 10000 });
      const rows2 = await page.$$eval('tbody tr', els => els.map(el => el.textContent.trim()));
      console.log('Table rows after add:', rows2);
    }
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/products-page.png', fullPage: true });
    console.log('Screenshot saved to /tmp/products-page.png');
    
  } catch (error) {
    console.error('Test error:', error.message);
    await page.screenshot({ path: '/tmp/error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testProductsPage();