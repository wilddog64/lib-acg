async function extractCredentials(page, outputFn) {
  await page.waitForFunction(() => {
    const inputs = Array.from(document.querySelectorAll('input[aria-label="Copyable input"]'));
    return inputs.some(inp => {
      if (!inp.value.trim()) return false;
      let node = inp.parentElement;
      for (let j = 0; j < 12; j++) {
        if (!node) break;
        if (/azure/i.test(node.innerText || '')) return true;
        node = node.parentElement;
      }
      return false;
    });
  }, { timeout: 15000 });

  const azureInputs = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[aria-label="Copyable input"]'));
    return inputs
      .filter(inp => {
        let node = inp.parentElement;
        for (let j = 0; j < 12; j++) {
          if (!node) break;
          if (/azure/i.test(node.innerText || '')) return true;
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
            if (/username|email/i.test(t)) fieldLabel = 'username';
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

  let username, password, subscriptionId, tenantId;
  for (const { value: val, fieldLabel } of azureInputs) {
    if (fieldLabel === 'username' && !username) username = val;
    else if (fieldLabel === 'password' && !password) password = val;
    else if (fieldLabel === 'subscription' && !subscriptionId) subscriptionId = val;
    else if (fieldLabel === 'tenant' && !tenantId) tenantId = val;
  }

  if (!username && azureInputs.length >= 1) username = azureInputs[0].value;
  if (!password && azureInputs.length >= 2) password = azureInputs[1].value;
  if (!subscriptionId && azureInputs.length >= 3) subscriptionId = azureInputs[2].value;
  if (!tenantId && azureInputs.length >= 4) tenantId = azureInputs[3].value;

  if (!username || !password) {
    throw new Error('Could not find Azure Username and Password credentials');
  }

  const creds = {
    AZURE_USERNAME: username.trim(),
    AZURE_PASSWORD: password.trim(),
  };
  if (subscriptionId) creds.AZURE_SUBSCRIPTION_ID = subscriptionId.trim();
  if (tenantId) creds.AZURE_TENANT_ID = tenantId.trim();
  outputFn(creds);
}

module.exports = { extractCredentials };
