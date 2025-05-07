const { truthy } = require('@stoplight/spectral-functions');

module.exports = {
  rules: {
    'no-empty-title': {
      description: 'Title must not be empty',
      message: 'The title property should not be empty.',
      given: '$.info.title',
      severity: 'error',
      then: {
        function: truthy
      }
    }
  }
}