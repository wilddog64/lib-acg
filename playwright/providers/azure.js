async function extractCredentials(page, outputFn) {
  await page.waitForFunction(() => {
    const others = ['AWS', 'Google Cloud', 'GCP'];
    const inputs = Array.from(document.querySelectorAll('input[aria-label="Copyable input"]'));
    return inputs.some(inp => {
      if (!inp.value.trim()) return false;
      let node = inp.parentElement;
      for (let j = 0; j < 12; j++) {
        if (!node) break;
        const t = node.innerText || '';
        if (/azure/i.test(t) && !others.some(p => t.includes(p))) return true;
        node = node.parentElement;
      }
      return false;
    });
  }, { timeout: 15000 });

  const azureInputs = await page.evaluate(() => {
    const others = ['AWS', 'Google Cloud', 'GCP'];
    const inputs = Array.from(document.querySelectorAll('input[aria-label="Copyable input"]'));
    return inputs
      .filter(inp => {
        let node = inp.parentElement;
        for (let j = 0; j < 12; j++) {
          if (!node) break;
          const t = node.innerText || '';
          if (/azure/i.test(t) && !others.some(p => t.includes(p))) return true;
          node = node.parentElement;
        }
        return false;
      })
      .map(inp => {
        let node = inp.parentElement;
        let fieldLabel = null;
        for (let j = 0; j < 6; j++) {
          if (!node) break;
          const t = node.innerText || '';
          if (!fieldLabel) {
            if (/client/i.test(t)) fieldLabel = 'clientId';
            else if (/\bsecret\b/i.test(t)) fieldLabel = 'clientSecret';
            else if (/username|email/i.test(t)) fieldLabel = 'username';
            else if (/password/i.test(t)) fieldLabel = 'password';
            else if (/subscription/i.test(t)) fieldLabel = 'subscription';
            else if (/tenant/i.test(t)) fieldLabel = 'tenant';
          }
          node = node.parentElement;
        }
        return { value: inp.value, fieldLabel };
      });
  });

  console.error(`INFO: Found ${azureInputs.length} Azure-scoped copyable inputs.`);

  if (azureInputs.length === 0) {
    throw new Error('No credentials found in Azure provider card');
  }

  let username, password, subscriptionId, tenantId, clientId, clientSecret;
  for (const { value: val, fieldLabel } of azureInputs) {
    if (fieldLabel === 'clientId' && !clientId) clientId = val;
    else if (fieldLabel === 'clientSecret' && !clientSecret) clientSecret = val;
    if (fieldLabel === 'username' && !username) username = val;
    else if (fieldLabel === 'password' && !password) password = val;
    else if (fieldLabel === 'subscription' && !subscriptionId) subscriptionId = val;
    else if (fieldLabel === 'tenant' && !tenantId) tenantId = val;
  }

  if (!username && azureInputs.length >= 1) username = azureInputs[0].value;
  if (!password && azureInputs.length >= 2) password = azureInputs[1].value;
  if (!subscriptionId && azureInputs.length >= 3) subscriptionId = azureInputs[2].value;
  if (!tenantId && azureInputs.length >= 4) tenantId = azureInputs[3].value;

  const hasUserPass = username && password;
  const hasServicePrincipal = clientId && clientSecret;
  if (!hasUserPass && !hasServicePrincipal) {
    throw new Error('Could not find Azure credentials (expected username+password or clientId+secret)');
  }

  const creds = {};
  if (username) creds.AZURE_USERNAME = username.trim();
  if (password) creds.AZURE_PASSWORD = password.trim();
  if (clientId) creds.AZURE_CLIENT_ID = clientId.trim();
  if (clientSecret) creds.AZURE_CLIENT_SECRET = clientSecret.trim();
  if (subscriptionId) creds.AZURE_SUBSCRIPTION_ID = subscriptionId.trim();
  if (tenantId) creds.AZURE_TENANT_ID = tenantId.trim();
  outputFn(creds);
}

module.exports = { extractCredentials };
