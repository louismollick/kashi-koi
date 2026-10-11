const { withInfoPlist } = require('expo/config-plugins');

/** Each user-started task has a unique identifier under this wildcard. */
module.exports = (config) =>
  withInfoPlist(config, (cfg) => {
    const identifier = '$(PRODUCT_BUNDLE_IDENTIFIER).downloads.*';
    const permitted = cfg.modResults.BGTaskSchedulerPermittedIdentifiers ?? [];
    if (!permitted.includes(identifier)) permitted.push(identifier);
    cfg.modResults.BGTaskSchedulerPermittedIdentifiers = permitted;
    return cfg;
  });
