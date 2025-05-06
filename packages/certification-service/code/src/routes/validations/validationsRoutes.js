// packages/certification-service/code/src/routes/validations/validationsRoutes.js
// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0

// --- CÓDIGO COMPLETO (CON koaBody REEMPLAZADO POR UN LOG) ---
const getValidationController = require('../../controllers/validation-controller');
const { timeout } = require('../../middleware/timeOut');
// const { koaBody } = require('koa-body'); // Ya no lo usamos directamente aquí
const fs = require('fs/promises');
const scoreFileUsecase = require('../../usecase/scoreFile-usecase');
const { getAppLogger } = require("../../log");
// const { configValue } = require("../../config/config"); // Ya no lo necesitamos aquí

const logger = getAppLogger();

const validationRoutes = (router, prefix) => {
  router
    // ───────── ORIGINAL ROUTES ─────────
    .post(
      `${prefix}/apis/validate`,
      timeout(120000),
      getValidationController.validate
    )
    .post(
      `${prefix}/apis/verify`,
      timeout(120000),
      getValidationController.validateFile
    )

    // ───────── NEW ROUTE: score-file (CON koaBody REEMPLAZADO) ─────────
    .post(
      `${prefix}/apis/score-file`,
      timeout(120000), // Middleware 1: Timeout
      // --- Middleware 2: Reemplazo temporal de koaBody ---
      async (ctx, next) => {
        logger.info('>>> TEMP DEBUG: Pasando por el slot donde estaba koaBody');
        // IMPORTANTE: Como no hay koaBody, ctx.request.files estará vacío.
        await next(); // Llama al siguiente middleware (el manejador async ctx => ...)
      },
      // --- Fin del reemplazo ---
      async ctx => { // Middleware 3: El manejador principal
        logger.info('>>> [/score-file Handler]: Entered!'); // ¿Llegamos aquí ahora?
        try {
          // 1) get protocol
          const apiProtocol =
            // ctx.request.body no funcionará bien aquí porque no hay koaBody que parseé texto/json tampoco
            ctx.query.apiProtocol || // Intentamos leer de la query string (?apiProtocol=REST)
            'REST';
          logger.info(`>>> [/score-file Handler]: apiProtocol = ${apiProtocol}`);

          // 2) grab uploaded file
          logger.info('>>> [/score-file Handler]: Accessing ctx.request.files...');
          let file = ctx.request.files?.file; // Esto será undefined ahora
          if (!file) {
             logger.warn('>>> [/score-file Handler]: ctx.request.files.file not found (ESPERADO, koaBody quitado)');
             // ... (lógica de fallback que no encontrará nada) ...
          }

          // Este if será SIEMPRE true ahora y lanzará el error 400
          if (!file) {
            logger.error('>>> [/score-file Handler]: No file found in ctx.request.files!');
            ctx.throw(400,'Missing "file" field (koaBody was removed for testing)'); // Mensaje modificado
          }

          // El código no debería llegar aquí...
          const actualPath = file.filepath;
          logger.info(`>>> [/score-file Handler]: Resolved actualPath: ${actualPath}`);
          const fileBuffer = await fs.readFile(actualPath);
          logger.info(`>>> [/score-file Handler]: File buffer read (${fileBuffer.length} bytes). Calling scoreFileUsecase...`);
          ctx.body = await scoreFileUsecase.execute({ fileBuffer, apiProtocol, file });
          logger.info('>>> [/score-file Handler]: scoreFileUsecase finished.');

        } catch (handlerError) {
            logger.error(`!!! Error within /score-file handler: ${handlerError.message}`, handlerError);
            ctx.throw(handlerError.status || 500, `Internal error in score-file handler: ${handlerError.message}`);
        }
      }
    );
};

module.exports = { validationRoutes };
// --- TERMINA CÓDIGO COMPLETO ---