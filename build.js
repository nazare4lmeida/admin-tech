const fs = require("fs");

const config = `
window.ENV = {
  SUPABASE_URL: "${process.env.SUPABASE_URL || ""}",
  SUPABASE_ANON_KEY: "${process.env.SUPABASE_ANON_KEY || ""}"
};
`;

fs.writeFileSync("js/config.js", config);
console.log("Arquivo js/config.js gerado com sucesso.");