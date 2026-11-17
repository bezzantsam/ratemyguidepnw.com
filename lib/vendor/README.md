# Vendored QR generator

`qrcodegen.ts` is Project Nayuki's MIT-licensed TypeScript QR generator, from
[QR-Code-generator](https://github.com/nayuki/QR-Code-generator/tree/bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d)
at commit `bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d`, upstream Git blob
`c4191ac0b5f8a24d87fd9340ceaa2d3b07d0231a`. The original license appears at the
top of the source. The only local change appends an export for the namespace.
QR generation runs locally; no third-party QR service receives profile URLs.
