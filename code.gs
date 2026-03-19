const WATCHLIST_SHEET_NAME = 'Watchlist';
const INDICATORS_SHEET_NAME = 'Indicators';

/**
 * Run this function once to set up the spreadsheet with the correct sheets and headers.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Setup Watchlist Sheet
  let watchlistSheet = ss.getSheetByName(WATCHLIST_SHEET_NAME);
  if (!watchlistSheet) {
    watchlistSheet = ss.insertSheet(WATCHLIST_SHEET_NAME);
  }
  watchlistSheet.getRange('A1:B1').setValues([['Symbol', 'Type']]);
  watchlistSheet.getRange('A1:B1').setFontWeight('bold');
  watchlistSheet.setFrozenRows(1);
  
  // Setup Indicators Sheet
  let indicatorsSheet = ss.getSheetByName(INDICATORS_SHEET_NAME);
  if (!indicatorsSheet) {
    indicatorsSheet = ss.insertSheet(INDICATORS_SHEET_NAME);
  }
  indicatorsSheet.getRange('A1:C1').setValues([['Symbol', 'IndicatorType', 'ParamsJSON']]);
  indicatorsSheet.getRange('A1:C1').setFontWeight('bold');
  indicatorsSheet.setFrozenRows(1);
  
  // Remove default "Sheet1" if it's empty and not needed
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  Logger.log('Setup complete! Sheets and columns are ready.');
}

function doGet(e) {
  const action = e.parameter.action;
  
  try {
    if (action === 'getWatchlist') {
      return createJsonResponse(getWatchlist());
    } else if (action === 'getIndicators') {
      const symbol = e.parameter.symbol;
      return createJsonResponse(getIndicators(symbol));
    } else if (action === 'yahooProxy') {
      const url = e.parameter.url;
      if (!url) return createJsonResponse({ error: 'Missing url parameter' }, 400);
      
      const response = UrlFetchApp.fetch(decodeURIComponent(url), {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      return ContentService.createTextOutput(response.getContentText())
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      return createJsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (error) {
    return createJsonResponse({ error: error.toString() }, 500);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'addWatchlist') {
      addWatchlist(data.symbol, data.type);
      return createJsonResponse({ success: true });
    } else if (action === 'removeWatchlist') {
      removeWatchlist(data.symbol);
      return createJsonResponse({ success: true });
    } else if (action === 'saveIndicators') {
      saveIndicators(data.symbol, data.indicators);
      return createJsonResponse({ success: true });
    } else {
      return createJsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (error) {
    return createJsonResponse({ error: error.toString() }, 500);
  }
}

function createJsonResponse(data, statusCode = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getWatchlist() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHLIST_SHEET_NAME);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      results.push({
        symbol: data[i][0].toString(),
        type: data[i][1] ? data[i][1].toString() : 'STOCK'
      });
    }
  }
  return results;
}

function addWatchlist(symbol, type) {
  if (!symbol) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHLIST_SHEET_NAME);
  if (!sheet) throw new Error('Watchlist sheet not found. Run setup() first.');
  
  // Check if already exists
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toUpperCase() === symbol.toUpperCase()) {
      return; // Already exists
    }
  }
  
  sheet.appendRow([symbol.toUpperCase(), type || 'STOCK']);
}

function removeWatchlist(symbol) {
  if (!symbol) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHLIST_SHEET_NAME);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0].toString().toUpperCase() === symbol.toUpperCase()) {
      sheet.deleteRow(i + 1);
    }
  }
}

function getIndicators(symbol) {
  if (!symbol) return [];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INDICATORS_SHEET_NAME);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toUpperCase() === symbol.toUpperCase()) {
      try {
        results.push({
          indicator: data[i][1].toString(),
          params: JSON.parse(data[i][2].toString())
        });
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
  }
  return results;
}

function saveIndicators(symbol, indicators) {
  if (!symbol || !indicators) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INDICATORS_SHEET_NAME);
  if (!sheet) throw new Error('Indicators sheet not found. Run setup() first.');
  
  // First, remove existing indicators for this symbol
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0].toString().toUpperCase() === symbol.toUpperCase()) {
      sheet.deleteRow(i + 1);
    }
  }
  
  // Then, append new indicators
  for (const ind of indicators) {
    if (ind.type) {
      sheet.appendRow([
        symbol.toUpperCase(),
        ind.type,
        JSON.stringify(ind.params || {})
      ]);
    }
  }
}

// Handle CORS preflight requests
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}
