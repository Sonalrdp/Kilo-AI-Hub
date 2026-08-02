/**
 * Google Apps Script to serve as a JSON API for the Kilo AI Chat Hub user database.
 * Paste this script into your Google Sheet's Apps Script Editor (Extensions > Apps Script).
 * After pasting, click "Deploy" > "New deployment" > Select type "Web app".
 * Set "Execute as" to "Me", and "Who has access" to "Anyone, even anonymous" 
 * (so the proxy server can call it without a Google login).
 */

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  var action = (e && e.parameter) ? e.parameter.action : null;
  
  if (action === "registerUser") {
    var email = e.parameter.email;
    var name = e.parameter.name;
    var userType = e.parameter.userType;
    var dailyLimit = Number(e.parameter.dailyLimit || 10000);
    var plan = e.parameter.plan;
    var price = Number(e.parameter.price || 0);
    
    if (!email) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var emailKey = email.toLowerCase().trim();
      var rows = sheet.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < rows.length; r++) {
        if (String(rows[r][1]).toLowerCase().trim() === emailKey) {
          foundRow = r + 1; // 1-indexed
          break;
        }
      }
      
      var parts = emailKey.split('@');
      var loginId = parts[0];
      if (!name) {
        name = loginId.charAt(0).toUpperCase() + loginId.slice(1);
      }
      
      if (foundRow > 0) {
        sheet.getRange(foundRow, 3).setValue(name);
        sheet.getRange(foundRow, 4).setValue(userType);
        sheet.getRange(foundRow, 5).setValue(dailyLimit);
        sheet.getRange(foundRow, 6).setValue(plan);
        sheet.getRange(foundRow, 7).setValue(price);
      } else {
        sheet.appendRow([loginId, emailKey, name, userType, dailyLimit, plan, price]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (regErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: regErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "sendOtp") {
    var email = e.parameter.email;
    var otp = e.parameter.otp;
    
    if (!email || !otp) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email or otp" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      GmailApp.sendEmail(email, "Kilo AI Chat Hub - Your Verification Code", "", {
        htmlBody: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 500px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #6366f1;">Welcome to Kilo AI Chat Hub!</h2>
            <p>Verification code to access your chat session.</p>
            <p>Please enter the following One-Time Password (OTP) to complete your verification:</p>
            <div style="font-size: 24px; font-weight: bold; background: #f3f4f6; padding: 10px 20px; border-radius: 5px; display: inline-block; color: #4f46e5; margin: 15px 0;">
              ${otp}
            </div>
            <p style="font-size: 12px; color: #666;">This code is valid for 5 minutes. If you did not request this code, you can safely ignore this email.</p>
          </div>
        `
      });
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (mailErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: mailErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "getUsage") {
    var key = e.parameter.key;
    if (!key) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing key" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var usageSheet = ss.getSheetByName("DailyUsage");
      if (!usageSheet) {
        usageSheet = ss.insertSheet("DailyUsage");
        usageSheet.appendRow(["Key", "Login ID", "Date", "Tokens"]);
      }
      
      var usageData = usageSheet.getDataRange().getValues();
      var tokens = 0;
      for (var r = 1; r < usageData.length; r++) {
        if (String(usageData[r][0]) === key) {
          tokens = Number(usageData[r][3]) || 0;
          break;
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, tokens: tokens }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (usageErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: usageErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "updateUsage") {
    var key = e.parameter.key;
    var loginId = e.parameter.loginId;
    var date = e.parameter.date;
    var tokens = Number(e.parameter.tokens || 0);
    
    if (!key || !loginId || !date) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing required parameters" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var usageSheet = ss.getSheetByName("DailyUsage");
      if (!usageSheet) {
        usageSheet = ss.insertSheet("DailyUsage");
        usageSheet.appendRow(["Key", "Login ID", "Date", "Tokens"]);
      }
      
      var usageData = usageSheet.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < usageData.length; r++) {
        if (String(usageData[r][0]) === key) {
          foundRow = r + 1; // 1-indexed
          break;
        }
      }
      
      var finalTokens = tokens;
      if (foundRow > 0) {
        var currentTokens = Number(usageSheet.getRange(foundRow, 4).getValue()) || 0;
        finalTokens = currentTokens + tokens;
        usageSheet.getRange(foundRow, 4).setValue(finalTokens);
      } else {
        usageSheet.appendRow([key, loginId, date, tokens]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, tokens: finalTokens }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (usageErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: usageErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var users = [];
  
  for (var i = 1; i < rows.length; i++) {
    var user = {};
    for (var j = 0; j < headers.length; j++) {
      user[headers[j]] = rows[i][j];
    }
    users.push(user);
  }
  
  var query = (e && e.parameter) ? e.parameter.q : null;
  
  if (query) {
    query = query.toLowerCase().trim();
    var match = users.find(function(u) {
      var dbId = String(u["Login ID"] || "").toLowerCase().trim();
      var dbEmail = String(u["Email"] || "").toLowerCase().trim();
      return dbId === query || dbEmail === query;
    });
    
    if (match) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, user: match }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      // Auto-register new Gmail address!
      if (query.indexOf("@gmail.com") !== -1 && query.indexOf("@gmail.com") === (query.length - 10)) {
        var parts = query.split("@");
        var loginId = parts[0];
        var name = loginId.charAt(0).toUpperCase() + loginId.slice(1);
        
        // Append a new row to the sheet
        var newUserRow = [loginId, query, name, "Free", 10000, "Free Plan", 0];
        sheet.appendRow(newUserRow);
        
        var newUser = {
          "Login ID": loginId,
          "Email": query,
          "Name": name,
          "User Type": "Free",
          "Daily Limit (Tokens)": 10000,
          "Plan": "Free Plan",
          "Price (Rs)": 0
        };
        
        return ContentService.createTextOutput(JSON.stringify({ success: true, user: newUser }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "User not found in user database." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // ===== Chat History Actions =====
  
  if (action === "saveChat") {
    var email = e.parameter.email;
    var chatId = e.parameter.chatId;
    var title = e.parameter.title || "Untitled";
    var messagesJson = e.parameter.messages || "[]";
    var updatedAt = e.parameter.updatedAt || String(Date.now());
    
    if (!email || !chatId) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email or chatId" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var histSheet = ss.getSheetByName("ChatHistory");
      if (!histSheet) {
        histSheet = ss.insertSheet("ChatHistory");
        histSheet.appendRow(["Email", "ChatId", "Title", "Messages", "UpdatedAt"]);
      }
      
      // Find existing row for this chatId
      var histData = histSheet.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < histData.length; r++) {
        if (String(histData[r][0]).toLowerCase() === email.toLowerCase() && String(histData[r][1]) === chatId) {
          foundRow = r + 1; // 1-indexed
          break;
        }
      }
      
      if (foundRow > 0) {
        histSheet.getRange(foundRow, 3).setValue(title);
        histSheet.getRange(foundRow, 4).setValue(messagesJson);
        histSheet.getRange(foundRow, 5).setValue(updatedAt);
      } else {
        histSheet.appendRow([email, chatId, title, messagesJson, updatedAt]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (histErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: histErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  if (action === "loadHistory") {
    var email = e.parameter.email;
    if (!email) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var histSheet = ss.getSheetByName("ChatHistory");
      if (!histSheet) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, history: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var histData = histSheet.getDataRange().getValues();
      var chats = [];
      for (var r = 1; r < histData.length; r++) {
        if (String(histData[r][0]).toLowerCase() === email.toLowerCase()) {
          chats.push({
            id: String(histData[r][1]),
            title: String(histData[r][2]),
            messages: histData[r][3],
            updatedAt: Number(histData[r][4])
          });
        }
      }
      
      // Sort latest first
      chats.sort(function(a, b) { return b.updatedAt - a.updatedAt; });
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, history: chats }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (loadErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: loadErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  if (action === "deleteChat") {
    var email = e.parameter.email;
    var chatId = e.parameter.chatId;
    if (!email || !chatId) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email or chatId" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var histSheet = ss.getSheetByName("ChatHistory");
      if (histSheet) {
        var histData = histSheet.getDataRange().getValues();
        for (var r = histData.length - 1; r >= 1; r--) {
          if (String(histData[r][0]).toLowerCase() === email.toLowerCase() && String(histData[r][1]) === chatId) {
            histSheet.deleteRow(r + 1);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (delErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: delErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Return all users if no query parameter is specified
  return ContentService.createTextOutput(JSON.stringify({ success: true, users: users }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action;

  if (action === "registerUser") {
    var email = params.email;
    var name = params.name;
    var userType = params.userType;
    var dailyLimit = Number(params.dailyLimit || 10000);
    var plan = params.plan;
    var price = Number(params.price || 0);
    
    if (!email) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var emailKey = email.toLowerCase().trim();
      var rows = sheet.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < rows.length; r++) {
        if (String(rows[r][1]).toLowerCase().trim() === emailKey) {
          foundRow = r + 1;
          break;
        }
      }
      
      var parts = emailKey.split('@');
      var loginId = parts[0];
      if (!name) {
        name = loginId.charAt(0).toUpperCase() + loginId.slice(1);
      }
      
      if (foundRow > 0) {
        sheet.getRange(foundRow, 3).setValue(name);
        sheet.getRange(foundRow, 4).setValue(userType);
        sheet.getRange(foundRow, 5).setValue(dailyLimit);
        sheet.getRange(foundRow, 6).setValue(plan);
        sheet.getRange(foundRow, 7).setValue(price);
      } else {
        sheet.appendRow([loginId, emailKey, name, userType, dailyLimit, plan, price]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (regErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: regErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "getUsage") {
    var key = params.key;
    if (!key) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing key" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var usageSheet = ss.getSheetByName("DailyUsage");
      if (!usageSheet) {
        usageSheet = ss.insertSheet("DailyUsage");
        usageSheet.appendRow(["Key", "Login ID", "Date", "Tokens"]);
      }
      
      var usageData = usageSheet.getDataRange().getValues();
      var tokens = 0;
      for (var r = 1; r < usageData.length; r++) {
        if (String(usageData[r][0]) === key) {
          tokens = Number(usageData[r][3]) || 0;
          break;
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, tokens: tokens }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (usageErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: usageErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "updateUsage") {
    var key = params.key;
    var loginId = params.loginId;
    var date = params.date;
    var tokens = Number(params.tokens || 0);
    
    if (!key || !loginId || !date) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing required parameters" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var usageSheet = ss.getSheetByName("DailyUsage");
      if (!usageSheet) {
        usageSheet = ss.insertSheet("DailyUsage");
        usageSheet.appendRow(["Key", "Login ID", "Date", "Tokens"]);
      }
      
      var usageData = usageSheet.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < usageData.length; r++) {
        if (String(usageData[r][0]) === key) {
          foundRow = r + 1; // 1-indexed
          break;
        }
      }
      
      var finalTokens = tokens;
      if (foundRow > 0) {
        var currentTokens = Number(usageSheet.getRange(foundRow, 4).getValue()) || 0;
        finalTokens = currentTokens + tokens;
        usageSheet.getRange(foundRow, 4).setValue(finalTokens);
      } else {
        usageSheet.appendRow([key, loginId, date, tokens]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, tokens: finalTokens }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (usageErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: usageErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "saveChat") {
    var email = params.email;
    var chatId = params.chatId;
    var title = params.title || "Untitled";
    var messagesJson = params.messages || "[]";
    var updatedAt = params.updatedAt || String(Date.now());

    if (!email || !chatId) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email or chatId" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var histSheet = ss.getSheetByName("ChatHistory");
      if (!histSheet) {
        histSheet = ss.insertSheet("ChatHistory");
        histSheet.appendRow(["Email", "ChatId", "Title", "Messages", "UpdatedAt"]);
      }

      var histData = histSheet.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < histData.length; r++) {
        if (String(histData[r][0]).toLowerCase() === email.toLowerCase() && String(histData[r][1]) === chatId) {
          foundRow = r + 1;
          break;
        }
      }

      if (foundRow > 0) {
        histSheet.getRange(foundRow, 3).setValue(title);
        histSheet.getRange(foundRow, 4).setValue(messagesJson);
        histSheet.getRange(foundRow, 5).setValue(updatedAt);
      } else {
        histSheet.appendRow([email, chatId, title, messagesJson, updatedAt]);
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (histErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: histErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "loadHistory") {
    var email = params.email;
    if (!email) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var histSheet = ss.getSheetByName("ChatHistory");
      if (!histSheet) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, history: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var histData = histSheet.getDataRange().getValues();
      var chats = [];
      for (var r = 1; r < histData.length; r++) {
        if (String(histData[r][0]).toLowerCase() === email.toLowerCase()) {
          chats.push({
            id: String(histData[r][1]),
            title: String(histData[r][2]),
            messages: histData[r][3],
            updatedAt: Number(histData[r][4])
          });
        }
      }

      chats.sort(function(a, b) { return b.updatedAt - a.updatedAt; });

      return ContentService.createTextOutput(JSON.stringify({ success: true, history: chats }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (loadErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: loadErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "deleteChat") {
    var email = params.email;
    var chatId = params.chatId;
    if (!email || !chatId) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing email or chatId" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var histSheet = ss.getSheetByName("ChatHistory");
      if (histSheet) {
        var histData = histSheet.getDataRange().getValues();
        for (var r = histData.length - 1; r >= 1; r--) {
          if (String(histData[r][0]).toLowerCase() === email.toLowerCase() && String(histData[r][1]) === chatId) {
            histSheet.deleteRow(r + 1);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (delErr) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: delErr.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid POST action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper function to auto-initialize headers and mock user data if sheet is empty.
 * Run this function once from the Apps Script console to populate your sheet!
 */
function initializeSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) {
    var headers = ["Login ID", "Email", "Name", "User Type", "Daily Limit (Tokens)", "Plan", "Price (Rs)"];
    var initialData = [
      ["free1", "free@kilo.ai", "Ankit Free", "Free", 10000, "Free Plan", 0],
      ["paid1", "paid@kilo.ai", "Ankit Paid Monthly", "Paid User", 200000, "Monthly Premium", 499],
      ["paid2", "paid2@kilo.ai", "Ankit Paid Quarterly", "Paid User", 200000, "Quarterly Premium", 1399],
      ["paid3", "paid3@kilo.ai", "Ankit Paid Yearly", "Paid User", 200000, "Yearly Premium", 4999],
      ["unlimit1", "unlimit@kilo.ai", "Ankit Unlimited Monthly", "Paid User (Unlimited)", 1000000, "Monthly Unlimited", 1499],
      ["unlimit2", "unlimit2@kilo.ai", "Ankit Unlimited Quarterly", "Paid User (Unlimited)", 1000000, "Quarterly Unlimited", 3999],
      ["unlimit3", "unlimit3@kilo.ai", "Ankit Unlimited Yearly", "Paid User (Unlimited)", 1000000, "Yearly Unlimited", 12999]
    ];
    
    sheet.appendRow(headers);
    for (var i = 0; i < initialData.length; i++) {
      sheet.appendRow(initialData[i]);
    }
  }
}
