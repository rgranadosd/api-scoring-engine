// src/main.js
// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0

const Koa = require("koa");
const http = require("http");
const { getAppLogger } = require("./log");
const { configValue } = require("./config/config");
const { bodyParser } = require("./middleware/bodyParser");
const { logRequest }  = require("./middleware/logRequest");
const { errorHandler }= require("./middleware/errorHandler");
const { router }      = require("./routes/router");
const { LintRuleset } = require("./evaluate/lint/lintRuleset");

async function init() {
  const logger = getAppLogger();
  // Preload any rulesets you need…
  await LintRuleset.updateKnownRulesets();

  const app = new Koa();
  const server = http.createServer(app.callback());

  // 1. Error handler must be first
  app.use(errorHandler);

  // 2. Logging each request
  app.use(logRequest);

  // 3. Global body parser (JSON + multipart)
  app.use(bodyParser());

  // 4. Mount all routes
  app.use(router.routes());

  // 5. Add allowedMethods so 405/501 work correctly
  app.use(router.allowedMethods());


  const PORT = configValue("service.port") || process.env.PORT || 8080;
  server.listen(PORT, () => {
    logger.info(`App listening on port ${PORT}`);
  });
}

init();
