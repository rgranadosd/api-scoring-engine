// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0

// --- CÓDIGO COMPLETO CORREGIDO (SIN SPAN Y CON BLOQUE DOCS COMENTADO) ---
const path = require("path");
const fs = require("fs");
const { LintRuleset } = require("../evaluate/lint/lintRuleset");
const { REST, EVENT, GRPC, GRAPHQL } = require("../evaluate/lint/protocols");
const {
  VALIDATION_TYPE_DESIGN,
  VALIDATION_TYPE_DOCUMENTATION,
  VALIDATION_TYPE_SECURITY,
  VALIDATION_TYPE_OVERALL_SCORE,
  SCORES_WEIGHTS_BY_VALIDATION_TYPE,
  SCORES_WEIGHTS_BY_VALIDATION_TYPE_WITHOUT_SECURITY,
  API_PROTOCOL,
  NUMBER_OF_GRPC_RULES,
} = require("./types.js");
const { calculateRating } = require("../scoring/grades");
const { scoreLinting, scoreMarkdown, calculateAverageScore } = require("../scoring/scoring");
const { getAppLogger } = require("../log");
const { RestLinter } = require("./restLinter");
const { EventLinter } = require("./eventLinter");
const { gRPCLinter } = require("./grpcLinter");
const { DocumentationLinter } = require("./documentationLinter");
const { DocumentationRuleset } = require("../evaluate/documentation/documentationRuleset");
const { GraphqlLinter } = require("./graphqlLinter.js");
const { checkForErrors } = require("./utils.js");

const logger = getAppLogger();

const validateApi = async (apiDir, tempDir, api, validationType) => {
  const apiProtocol = api && api["api-spec-type"] ? api["api-spec-type"].toUpperCase() : null;
  if (!apiProtocol) {
       logger.error(`API validation skipped: Missing or invalid 'api-spec-type' in metadata for API: ${api ? api.name : 'Unknown'}`);
       return { validationType: "ERROR", apiName: api ? api.name : 'Unknown', error: "Missing or invalid 'api-spec-type' in metadata." };
  }

  // Log corregido
  logger.info(`Validating API '<span class="math-inline">\{api\.name \|\| 'Unnamed'\}/</span>{apiProtocol}' using validateApi...`);

  let apiFileName;
  try {
      apiFileName = getApiFile(api, apiProtocol);
  } catch (e) {
       logger.error(`API validation skipped for '${api.name || 'Unnamed'}': ${e.message}`);
       return { validationType: "ERROR", apiName: api.name || 'Unnamed', error: e.message };
  }

  const file = path.join(apiDir, apiFileName);
  // Log corregido
  logger.info(`   Using specification file: ${file} (relative name: ${apiFileName})`);

  if (!fs.existsSync(file)) {
       // Log corregido
       logger.error(`   Specification file not found at path: <span class="math-inline">\{file\}\. Cannot proceed with validation for '</span>{api.name || 'Unnamed'}'.`);
       return { validationType: "ERROR", apiName: api.name || 'Unnamed', error: `Specification file ${apiFileName} not found at expected location.` };
  }

  const requestedValidationType = validationType === VALIDATION_TYPE_OVERALL_SCORE ? null : validationType;

  let apiValidationResult = {
    validationDateTime: new Date().toISOString(),
    apiName: api.name,
    apiVersion: api.version,
    apiProtocol: API_PROTOCOL[apiProtocol] || apiProtocol,
    result: [],
    score: 0,
    rating: "D",
    ratingDescription: "",
    hasErrors: false,
  };

  const design = { designValidation: { validationType: VALIDATION_TYPE_DESIGN, validationIssues: [], spectralValidation: { issues: [] }, protolintValidation: { issues: [] } } };
  const security = { securityValidation: { validationType: VALIDATION_TYPE_SECURITY, validationIssues: [], spectralValidation: { issues: [] }, protolintValidation: { issues: [] } } };
  const documentation = { documentationValidation: { validationType: VALIDATION_TYPE_DOCUMENTATION, issues: [], validationIssues: [] } };

  let numberOfDesignRules = 0;

  try {
      logger.info(`   Running linters for protocol ${apiProtocol}...`);
      switch(apiProtocol) {
          // ... (Casos REST, EVENT, GRPC, GRAPHQL como estaban antes) ...
           case REST:
              await RestLinter.lintRest({ validationType: requestedValidationType, file, fileName: apiFileName, apiValidation: apiValidationResult, design, security, tempDir: apiDir });
              numberOfDesignRules = LintRuleset.REST_GENERAL.numberOfRules;
              break;
          case EVENT:
              await EventLinter.lintEvent({ file, validationType: requestedValidationType, fileName: apiFileName, apiDir, tempDir: apiDir, apiValidation: apiValidationResult, design });
              numberOfDesignRules = LintRuleset.EVENT_GENERAL.numberOfRules + LintRuleset.AVRO_GENERAL.numberOfRules;
              security.securityValidation.score = 100; // Default score
              break;
          case GRPC:
              await gRPCLinter.lintgRPC(requestedValidationType, apiDir, apiDir, design, new Map());
              numberOfDesignRules = NUMBER_OF_GRPC_RULES;
               security.securityValidation.score = 100; // Default score
              break;
          case GRAPHQL:
              const graphqlLinter = new GraphqlLinter();
              await graphqlLinter.lint(requestedValidationType, apiDir, apiDir, design);
              design.designValidation.spectralValidation.issues = design.designValidation.validationIssues.map(i => ({fileName: i.fileName,code: i.code,message: i.message,severity: i.severity,source: i.fileName,range: i.range,path: i.path}));
              numberOfDesignRules = graphqlLinter.numberOfRulesExcludingInfoSeverity;
               security.securityValidation.score = 100; // Default score
              break;
          default:
              logger.warn(`   Unsupported API Protocol for linting: ${apiProtocol}`);
              design.designValidation.score = 0;
              security.securityValidation.score = 0;
              documentation.documentationValidation.score = 0;
              break;
      }
      logger.info(`   Linters finished.`);

      // --- Ejecutar Validación de Documentación (TEMPORALMENTE COMENTADO) ---
       /* <--- INICIO BLOQUE COMENTADO
       if (!requestedValidationType || requestedValidationType === VALIDATION_TYPE_DOCUMENTATION) {
           logger.info(`   Running documentation linter...`);
           await DocumentationLinter.lintDocumentation(requestedValidationType, apiDir, api, documentation);
           logger.info(`   Documentation linter finished.`);
       } else {
            documentation.documentationValidation.score = 0;
            logger.info(`   Skipping active documentation linting due to requestedValidationType: ${requestedValidationType}`);
       }
       */ // <--- FIN BLOQUE COMENTADO
      // Como lo hemos comentado, forzamos el score de documentación a 0 siempre para esta prueba
      documentation.documentationValidation.score = 0;
      logger.info(`   Documentation linting SKIPPED for testing. Score forced to 0.`);
      // --- Fin Validación Documentación ---


      // --- Calcular Puntuaciones y Ratings ---
      logger.info(`   Calculating scores and ratings...`);

      // Design Score & Rating
       if (!requestedValidationType || requestedValidationType === VALIDATION_TYPE_DESIGN) {
           design.designValidation.score = scoreLinting(design.designValidation.validationIssues, numberOfDesignRules);
       } else { design.designValidation.score = 100; }
       Object.assign(design.designValidation, calculateRating(design.designValidation.score));

      // Security Score & Rating
      if (apiProtocol === REST && (!requestedValidationType || requestedValidationType === VALIDATION_TYPE_SECURITY)) {
           security.securityValidation.score = scoreLinting(
               security.securityValidation.validationIssues,
               LintRuleset.REST_SECURITY.numberOfRules,
           );
       } else if (!requestedValidationType || requestedValidationType === VALIDATION_TYPE_SECURITY) {
           if (!security.securityValidation.validationIssues || security.securityValidation.validationIssues.length === 0) {
                security.securityValidation.score = 100;
           } else { security.securityValidation.score = scoreLinting(security.securityValidation.validationIssues, 0); }
       } else { security.securityValidation.score = 100; }
       Object.assign(security.securityValidation, calculateRating(security.securityValidation.score));


      // Documentation Score & Rating (Score ya es 0, calculamos rating N/A siempre en esta prueba)
       Object.assign(documentation.documentationValidation, calculateRating(documentation.documentationValidation.score)); // Calcula rating para 0 (será D)
       // Sobrescribimos con N/A porque hemos comentado la lógica real
       documentation.documentationValidation.rating = "N/A";
       documentation.documentationValidation.ratingDescription = "Not Applicable (Testing)";


      // --- Ensamblar Resultado y Calcular Overall ---
      apiValidationResult.result = [design, security, documentation];

      if (requestedValidationType) {
          apiValidationResult.result = apiValidationResult.result.filter(r =>
              Object.values(r)[0].validationType === requestedValidationType
          );
      }

       // Log corregido
       logger.info(`   Calculating overall API rating for '<span class="math-inline">\{api\.name \|\| 'Unnamed'\}/</span>{apiProtocol}'`);
      let scoresForAverage = [];
      let weightsToUse;

      scoresForAverage.push([design.designValidation.score, VALIDATION_TYPE_DESIGN]);
      scoresForAverage.push([documentation.documentationValidation.score, VALIDATION_TYPE_DOCUMENTATION]); // Siempre será 0 aquí

      if (apiProtocol === REST) {
           scoresForAverage.push([security.securityValidation.score, VALIDATION_TYPE_SECURITY]);
           weightsToUse = SCORES_WEIGHTS_BY_VALIDATION_TYPE;
      } else {
           weightsToUse = SCORES_WEIGHTS_BY_VALIDATION_TYPE_WITHOUT_SECURITY;
      }

      logger.info(`>>> validateApi: Weights for Average Score: ${JSON.stringify(weightsToUse)}`); // Log de pesos
      apiValidationResult.score = calculateAverageScore(scoresForAverage, weightsToUse);
      Object.assign(apiValidationResult, calculateRating(apiValidationResult.score));

       apiValidationResult.hasErrors = checkForErrors(apiValidationResult, [
           ...design.designValidation.validationIssues,
           ...security.securityValidation.validationIssues,
           ...documentation.documentationValidation.validationIssues, // Esto estará vacío
       ]);

      // Log corregido
      logger.info(`   Finished calculating scores and ratings for '${api.name || 'Unnamed'}'. Overall Score: ${apiValidationResult.score}, Rating: ${apiValidationResult.rating}`);

  } catch (validationError) {
       logger.error(`   Error during validation process for API '${api.name || 'Unnamed'}': ${validationError.message}`, validationError);
       apiValidationResult = {
            validationType: "ERROR",
            apiName: api.name || 'Unnamed',
            definitionPath: api ? api["definition-path"] : undefined,
            error: `Validation process failed: ${validationError.message}`
       };
  }

  return apiValidationResult;
};

// --- FUNCIÓN AUXILIAR getApiFile --- ¡CORREGIDA! ---
function getApiFile(api, apiProtocol) {
  if (api && api["definition-file"]) {
    logger.debug(`   getApiFile: Using explicit 'definition-file': ${api["definition-file"]}`);
    return api["definition-file"];
  }
  if (apiProtocol === EVENT) {
    logger.debug(`   getApiFile: Using default for EVENT protocol: asyncapi.yml`);
    return "asyncapi.yml";
  }
  if (api && api["definition-path"]) {
    const filename = path.basename(api["definition-path"]);
    logger.debug(`   getApiFile: Using filename from 'definition-path' (${api["definition-path"]}): ${filename}`);
    return filename;
  }
  const errorMessage = `Cannot determine API file name for API '${api ? (api.name || 'Unnamed') : 'Unknown'}'. Missing 'definition-file' or 'definition-path' in metadata.`;
  logger.error(errorMessage);
  throw new Error(errorMessage);
}
// --- Fin getApiFile ---

module.exports = { validateApi };
// --- TERMINA CÓDIGO COMPLETO ---