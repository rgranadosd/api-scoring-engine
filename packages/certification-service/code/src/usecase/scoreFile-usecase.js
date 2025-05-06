// File: src/usecase/scoreFile-usecase.js
// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
// Importamos directamente los Linters y la lógica de validación/scoring/rating
const { RestLinter } = require("../verify/restLinter");
const { EventLinter } = require("../verify/eventLinter");
const { gRPCLinter } = require("../verify/grpcLinter");
const { GraphqlLinter } = require("../verify/graphqlLinter.js");
// NOTA: No necesitamos DocumentationLinter aquí si siempre es 0/N/A
const { scoreLinting, calculateAverageScore } = require("../scoring/scoring");
const { calculateRating } = require("../scoring/grades");
const { LintRuleset } = require("../evaluate/lint/lintRuleset");
const { evaluate, retrieveNumberOfRules } = require("../evaluate/spectralEvaluate"); // Necesario para num reglas
const {
    VALIDATION_TYPE_DESIGN,
    VALIDATION_TYPE_DOCUMENTATION,
    VALIDATION_TYPE_SECURITY,
    SCORES_WEIGHTS_BY_VALIDATION_TYPE,
    SCORES_WEIGHTS_BY_VALIDATION_TYPE_WITHOUT_SECURITY,
    API_PROTOCOL,
    NUMBER_OF_GRPC_RULES
} = require("../verify/types.js");
const { getAppLogger } = require("../log");
const { generateRandomFolder } = require("../verify/lint"); // Para carpeta temporal
const { checkForErrors } = require("../verify/utils"); // Para hasErrors

const logger = getAppLogger();

module.exports.execute = async ({ fileBuffer, apiProtocol, file }) => {
  logger.info(`>>> scoreFileUseCase: Starting execution (v2 - mimicking validateApi)...`);

  // Determinar nombre fichero original (si está disponible)
  const originalFilename = file?.originalFilename || file?.name || `uploaded_spec.${apiProtocol.toLowerCase()}`;

  // Crear carpeta y fichero temporal
  const tempDir = generateRandomFolder();
  const tempFilePath = path.join(tempDir, originalFilename); // Usamos nombre original en temp
  let finalResult = {}; // Objeto para el resultado final

  try {
    logger.info(`>>> scoreFileUseCase: Writing spec to temporary file: ${tempFilePath}`);
    await fs.mkdir(tempDir, { recursive: true }); // Asegurar que el directorio existe
    await fs.writeFile(tempFilePath, fileBuffer);
    logger.info(">>> scoreFileUseCase: Temporary file written.");

    // Inicializar objetos para resultados parciales (similar a validateApi)
    // Usaremos estos para que los Linters puedan llenarlos
    const design = { designValidation: { validationType: VALIDATION_TYPE_DESIGN, validationIssues: [], spectralValidation: { issues: [] }, protolintValidation: { issues: [] } } };
    const security = { securityValidation: { validationType: VALIDATION_TYPE_SECURITY, validationIssues: [], spectralValidation: { issues: [] }, protolintValidation: { issues: [] } } };
    // La documentación la manejaremos aparte como 0/N/A
    let numberOfDesignRules = 0;

    // --- Ejecutar Linter Específico del Protocolo ---
    // Esta es la parte clave: usamos el mismo Linter que usaría validateApi
    logger.info(`>>> scoreFileUseCase: Running linter for protocol ${apiProtocol}...`);
    switch(apiProtocol) {
        case API_PROTOCOL.REST:
            // Llamamos a RestLinter pasando los objetos design y security para que los llene
            await RestLinter.lintRest({
                validationType: null, // Pedimos todo (no filtramos por tipo aquí)
                file: tempFilePath,
                fileName: originalFilename,
                apiValidation: {}, // Pasamos objeto vacío, no relevante aquí
                design, // Objeto para issues de diseño
                security, // Objeto para issues de seguridad
                tempDir // Directorio temporal
            });
            numberOfDesignRules = LintRuleset.REST_GENERAL.numberOfRules;
            break;
        // --- Añadir casos para EVENT, GRPC, GRAPHQL si se necesitan, ---
        // --- llamando a sus respectivos Linters como en validateApi ---
        // case API_PROTOCOL.EVENT: ... await EventLinter.lintEvent(...) ... break;
        // case API_PROTOCOL.GRPC: ... await gRPCLinter.lintgRPC(...) ... break;
        // case API_PROTOCOL.GRAPHQL: ... await graphqlLinter.lint(...) ... break;
        default:
            logger.warn(`>>> scoreFileUseCase: Unsupported API Protocol for detailed linting: ${apiProtocol}. Only calculating initial lint.`);
            // Si el protocolo no es soportado por un Linter específico,
            // podríamos basarnos solo en el lintScore inicial o asignar 0?
            // Por ahora, asignaremos 0 a diseño/seguridad si no es REST.
             design.designValidation.score = 0;
             security.securityValidation.score = 0;
            break;
    }
    logger.info(`>>> scoreFileUseCase: Linter finished.`);

    // --- Calcular Puntuaciones y Ratings ---
    logger.info(`>>> scoreFileUseCase: Calculating scores and ratings...`);

    // Usar los issues poblados por el Linter para calcular las notas
    const designScore = scoreLinting(design.designValidation.validationIssues, numberOfDesignRules);
    // Usamos la misma lógica para security que en validateApi
    const securityScore = scoreLinting(
        security.securityValidation.validationIssues,
        LintRuleset.REST_SECURITY.numberOfRules // Asumimos REST aquí, ajustar si soportas otros protocolos
    );
    const documentationScore = 0; // Forzamos a 0

    logger.info(`>>> scoreFileUseCase: Calculated scores -> Design: ${designScore}, Security: ${securityScore}, Docs: ${documentationScore}`);

    // Calcular Overall Score con media ponderada (como en validateApi)
    let overallScore;
    let weightsToUse;
     logger.info(`>>> scoreFileUseCase: Calculating weighted overall score for protocol ${apiProtocol}...`);
     if (apiProtocol === API_PROTOCOL.REST) {
         weightsToUse = SCORES_WEIGHTS_BY_VALIDATION_TYPE;
         logger.info(`>>> scoreFileUseCase: Weights for Average Score (REST): ${JSON.stringify(weightsToUse)}`);
         overallScore = calculateAverageScore(
             [ [designScore, VALIDATION_TYPE_DESIGN], [documentationScore, VALIDATION_TYPE_DOCUMENTATION], [securityScore, VALIDATION_TYPE_SECURITY] ],
             weightsToUse
         );
     } else {
          // Añadir lógica para otros pesos si soportas otros protocolos aquí
         weightsToUse = SCORES_WEIGHTS_BY_VALIDATION_TYPE_WITHOUT_SECURITY; // Ejemplo para otros
         logger.info(`>>> scoreFileUseCase: Weights for Average Score (non-REST): ${JSON.stringify(weightsToUse)}`);
          overallScore = calculateAverageScore(
             [ [designScore, VALIDATION_TYPE_DESIGN], [documentationScore, VALIDATION_TYPE_DOCUMENTATION] ],
             weightsToUse
         );
     }
     logger.info(`>>> scoreFileUseCase: Calculated weighted overallScore: ${overallScore}`);

    // Calcular Ratings usando la función importada
    logger.info(`>>> scoreFileUseCase: Calculating ratings using calculateRating function...`);
    const designRatingInfo = calculateRating(designScore);
    const securityRatingInfo = calculateRating(securityScore);
    // Lint score inicial (lo calculamos aunque no usemos validateFileUseCase directamente)
    // Para replicar, necesitaríamos ejecutar el linter inicial aquí o extraerlo.
    // Por simplicidad ahora, lo omitimos o ponemos por defecto. Pongamos 100 si no hay errores de severidad 0 en design/security?
    // O mejor, lo quitamos de este resultado para evitar confusión, ya que este flujo no hace el "linting inicial" separado.
    // const lintRatingInfo = calculateRating(lintScore); // lintScore no se calcula aquí

    const overallRatingInfo = calculateRating(overallScore);
    const documentationRating = "N/A"; // Mantenemos N/A
    const documentationRatingDescription = "Not Applicable";

    // --- Preparar Objeto Final ---
    logger.info(">>> scoreFileUseCase: Preparing final result object...");
    finalResult = {
      // Scores Numéricos
      designScore,
      securityScore,
      documentationScore,
      overallScore, // Calculado con lógica ponderada
      // Quitamos lintScore/lintRating para evitar confusión con el flujo original
      // lintScore: lintScore,

      // Ratings y Descripciones
      designRating: designRatingInfo.rating,
      designRatingDescription: designRatingInfo.ratingDescription,
      securityRating: securityRatingInfo.rating, // Debería dar 'C' para 61.9 ahora
      securityRatingDescription: securityRatingInfo.ratingDescription,
      documentationRating: documentationRating,
      documentationRatingDescription: documentationRatingDescription,
      overallRating: overallRatingInfo.rating, // Debería dar 'C' para 59.85
      overallRatingDescription: overallRatingInfo.ratingDescription,
      // lintRating: lintRatingInfo.rating,
      // lintRatingDescription: lintRatingInfo.description,

      // Devolvemos los issues encontrados por los linters específicos si son útiles
      // (Nota: el formato puede variar respecto al 'lintIssues' original)
      designIssues: design.designValidation.validationIssues,
      securityIssues: security.securityValidation.validationIssues,
    };

    logger.info(">>> scoreFileUseCase: Execution finished (v2 - mimicking validateApi).");

  } catch (error) {
      logger.error(`!!! Error within scoreFileUseCase v2: ${error.message}`, error);
      // Devolver un objeto de error consistente
      finalResult = { error: `Processing failed in scoreFileUseCase: ${error.message}` };
  } finally {
      // Limpiar fichero y directorio temporal
      if (tempDir && await fs.stat(tempDir).catch(() => false)) {
          logger.info(`>>> scoreFileUseCase: Cleaning up temporary folder: ${tempDir}`);
          try {
              await fs.rm(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
              logger.warn(`>>> scoreFileUseCase: Failed to cleanup temporary folder ${tempDir}: ${cleanupError.message}`);
          }
      }
  }

  return finalResult; // Devuelve el objeto de resultado o el objeto de error
};
