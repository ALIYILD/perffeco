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

    // Inject affiliate ref codes
    const runpodRef = process.env.RUNPOD_REF || 'perffeco';
    const vastRef = process.env.VAST_REF || 'perffeco';
    const gtmId = process.env.GTM_ID || '';

    html = html.replace(
      /ref:\s*'perffeco',\s*base:\s*'https:\/\/runpod\.io\?ref='/,
      `ref: '${runpodRef}', base: 'https://runpod.io?ref='`
    );
    html = html.replace(
      /ref:\s*'perffeco',\s*refId:\s*'perffeco',\s*base:\s*'https:\/\/cloud\.vast\.ai\/\?ref='/,
      `ref: '${vastRef}', refId: '${vastRef}', base: 'https://cloud.vast.ai/?ref='`
    );

    // Inject GTM container ID (skip if not set)
    if (gtmId && gtmId !== 'GTM-XXXXXXX') {
      html = html.replace(/GTM-XXXXXXX/g, gtmId);
    }

    // Update hardcoded affiliate links in provider compare cards
    html = html.replace(
      /ref=perffeco&ref_id=perffeco/g,
      `ref=${vastRef}&ref_id=${vastRef}`
    );
    html = html.replace(
      /runpod\.io\?ref=perffeco/g,
      `runpod.io?ref=${runpodRef}`
    );

    fs.writeFileSync(htmlPath, html);
    console.log(`Injected: RUNPOD_REF=${runpodRef}, VAST_REF=${vastRef}, GTM=${gtmId || 'not set'}`);
  },
};
