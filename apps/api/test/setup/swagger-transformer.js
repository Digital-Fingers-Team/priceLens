// ts-jest wrapper for the @nestjs/swagger compiler plugin, which `nest build`
// runs from nest-cli.json. The e2e OpenAPI test needs the DTO metadata it adds.
const transformer = require('@nestjs/swagger/plugin');

module.exports.name = 'nestjs-swagger-transformer';
// Bump when the options change, so ts-jest drops its cached output.
module.exports.version = 1;
module.exports.factory = (compiler) => transformer.before({ introspectComments: true }, compiler.program);
