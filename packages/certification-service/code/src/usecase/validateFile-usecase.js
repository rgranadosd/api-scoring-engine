// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0

const fs = require("fs");
const path = require("path");
const { getAppLogger } = require("../log");
const { downloadFile } = require("../utils/downloadUtils");
const {
  lintFilesWithProtolint,
  lintFileWithSpectral,
  generateRandomFolder,
  lintGraphqlFile,
} = require("../verify/lint");
const { checkForErrors } = require("../verify/utils");
const { LintRuleset } = require("../evaluate/lint/lintRuleset");
const { API_PROTOCOL } = require("../verify/types");
const { fromSpectralIssue, fromProtolintIssue, fromEslintIssue } = require("../format/issue");
const { isGraphqlFileExtension } = require("../utils/fileUtils");
const graphqlLinterDefaultConfig = require("../rules/graphql");

const logger = getAppLogger();

/**
 * input puede ser:
 *  - objeto file de koa-body (tiene .filepath o .path)
 *  - string URL
 */
module.exports.execute = async (input, apiProtocol) => {
  let filePath;
  let tempFileCopy;
  let folderPath = generateRandomFolder();
  let fileName;
  try {
    // ——— fichero subido
    if (
      input &&
      typeof input !== "string" &&
      (input.filepath || input.path)
    ) {
      // koa-body en v6 usa `input.filepath`, fallback a `input.path`
      filePath = input.filepath || input.path;
      fileName = input.originalFilename || input.name || path.basename(filePath);

      // copiar para conservar extensión
      tempFileCopy = `${filePath}_${fileName}`;
      fs.copyFileSync(filePath, tempFileCopy);
      logger.info(`Received file ${fileName}`);
      filePath = tempFileCopy;
    // ——— URL
    } else if (typeof input === "string") {
      fileName = input.split("/").pop().split("?").shift();
      filePath = path.join(folderPath, fileName);
      logger.info(`Downloading ${input} to ${filePath}`);
      await downloadFile(input, filePath);

    } else {
      throw new Error("Invalid input for validation");
    }

    // ——— ejecutar lint según protocolo
    let results = [];
    let issues = [];
    const tempDir = path.dirname(filePath);

    switch (apiProtocol) {
      case API_PROTOCOL.REST:
        results = await lintFileWithSpectral({
          file: filePath,
          ruleset: LintRuleset.REST_GENERAL.rulesetPath,
        });
        issues = results.map(i => fromSpectralIssue(i, filePath, tempDir));
        break;

      case API_PROTOCOL.EVENT:
        results = await lintFileWithSpectral({
          file: filePath,
          ruleset: LintRuleset.EVENT_GENERAL.rulesetPath,
        });
        issues = results.map(i => fromSpectralIssue(i, filePath, tempDir));
        break;

      case API_PROTOCOL.GRPC:
        const protoResults = await lintFilesWithProtolint(filePath, new Map());
        results = protoResults.map(i => ({
          fileName,
          code: i.rule,
          message: i.message,
          severity: i.severity,
          source: fileName,
          range: {
            start: { line: i.line, character: i.column },
            end: { line: i.line, character: i.column },
          },
          path: [],
        }));
        issues = protoResults.map(i => fromProtolintIssue(i, filePath, tempDir));
        break;

      case API_PROTOCOL.GRAPHQL:
        const gqlResults = await lintGraphqlFile(filePath, graphqlLinterDefaultConfig);
        gqlResults.forEach(el =>
          el.messages.forEach(msg =>
            issues.push(fromEslintIssue(msg, el.filePath, tempDir))
          )
        );
        results = issues.map(issue => ({
          fileName,
          code: issue.code,
          message: issue.message,
          severity: issue.severity,
          source: fileName,
          range: issue.range,
          path: issue.path,
        }));
        break;

      default:
        break;
    }

    // Normalizar fuente y check de errores
    results.forEach(i => { i.source = fileName; });
    const output = {
      hasErrors: false,
      results,
      issues: issues.map(i => ({ ...i, fileName })),
    };
    output.hasErrors = checkForErrors(output, results);
    return output;

  } finally {
    // limpiar temporales
    if (tempFileCopy) {
      fs.unlink(tempFileCopy, err =>
        err && logger.error(err.message, `COPY ${tempFileCopy}`)
      );
    }
    if (folderPath && typeof input === "string") {
      fs.rm(folderPath, { recursive: true }, err =>
        err && logger.error(err.message, `FOLDER ${folderPath}`)
      );
    }
  }
};
