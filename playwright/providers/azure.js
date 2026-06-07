async function extractCredentials(page, outputFn) {
  await page.waitForSelector('input[aria-label="Copyable input"]', { timeout: 15000 });
  const inputs = await page.locator('input[aria-label="Copyable input"]').all();
  console.error(`INFO: Found ${inputs.length} copyable inputs.`);

  let username, password, subscriptionId, tenantId;
  for (let i = 0; i < inputs.length; i++) {
    const val = await inputs[i].inputValue().catch(() => '');
    const parent = await inputs[i].evaluateHandle(el => el.closest('div')?.parentElement ?? null);
    const text = parent ? await parent.evaluate(el => el.innerText || '') : '';
    const textLower = text.toLowerCase();

    if (textLower.includes('username') || textLower.includes('email')) {
      username = val;
    } else if (textLower.includes('password')) {
      password = val;
    } else if (textLower.includes('subscription')) {
      subscriptionId = val;
    } else if (textLower.includes('tenant')) {
      tenantId = val;
    }
  }

  if (!username && inputs.length >= 1) username = await inputs[0].inputValue().catch(() => '');
  if (!password && inputs.length >= 2) password = await inputs[1].inputValue().catch(() => '');
  if (!subscriptionId && inputs.length >= 3) subscriptionId = await inputs[2].inputValue().catch(() => '');
  if (!tenantId && inputs.length >= 4) tenantId = await inputs[3].inputValue().catch(() => '');

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
