const fs = require('fs');
const path = require('path');

module.exports = {
  onPostBuild: ({ constants, utils }) => {
    const htmlPath = path.join(constants.PUBLISH_DIR, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      utils.build.failBuild('index.html not found in publish dir');
      return;
    }

    let html = fs.readFileSync(htmlPath, 'utf8');

    // Affiliate ref codes from env vars
    const doRef = process.env.DO_REF || 'perffeco';
    const vultrRef = process.env.VULTR_REF || 'perffeco';
    const gtmId = process.env.GTM_ID || '';

    // Replace DigitalOcean ref in JS config and hardcoded links
    html = html.replace(
      /digitalocean:\s*\{\s*ref:\s*'perffeco'/,
      `digitalocean: { ref: '${doRef}'`
    );
    html = html.replace(/refcode=perffeco/g, `refcode=${doRef}`);

    // Replace Vultr ref in JS config and hardcoded links
    html = html.replace(
      /vultr:\s*\{\s*ref:\s*'perffeco'/,
      `vultr: { ref: '${vultrRef}'`
    );
    html = html.replace(/vultr\.com\/products\/cloud-gpu\/\?ref=perffeco/g,
      `vultr.com/products/cloud-gpu/?ref=${vultrRef}`);

    // Inject GTM container ID (skip if placeholder)
    if (gtmId && gtmId !== 'GTM-XXXXXXX') {
      html = html.replace(/GTM-XXXXXXX/g, gtmId);
    }

    fs.writeFileSync(htmlPath, html);
    console.log(`Injected: DO_REF=${doRef}, VULTR_REF=${vultrRef}, GTM=${gtmId || 'not set'}`);
  },
};
