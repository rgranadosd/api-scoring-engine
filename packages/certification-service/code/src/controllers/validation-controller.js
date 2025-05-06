// packages/certification-service/code/src/controllers/validation-controller.js
// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0

const validateRepositoryUseCase = require("../usecase/validateRepository-usecase");
const validateFileUseCase       = require("../usecase/validateFile-usecase");

module.exports = {
  /**
   * POST /apifirst/v1/apis/validate
   * Expects JSON body with { url, validationType, isVerbose }
   */
  validate: async ctx => {
    const { url, validationType, isVerbose = false } = ctx.request.body || {};

    if (!url || typeof url !== "string") {
      ctx.throw(400, 'Missing or invalid "url" in request body');
    }

    // Ejecuta la validación de repositorio
    // Firma: execute(url: string, validationType?: string, isVerbose?: boolean)
    const results = await validateRepositoryUseCase.execute(
      url,
      validationType,
      isVerbose
    );

    ctx.body = results;
  },

  /**
   * POST /apifirst/v1/apis/verify
   * Expects multipart/form-data with field `file` and optional `apiProtocol`
   */
  validateFile: async ctx => {
    const { apiProtocol = "REST" } = ctx.request.body || {};
    const { file } = ctx.request.files || {};

    if (!file) {
      ctx.throw(400, 'Missing "file" field (multipart/form-data)');
    }

    // file es el objeto de koa-body con filepath, originalFilename...
    ctx.body = await validateFileUseCase.execute(file, apiProtocol);
  },
};
