Geração Tech — Painel Administrativo

Sistema web para gestão acadêmica de alunos dos programas:

Fullstack
IA Generativa
IA + Soft Skills
Sobre o projeto

Este painel permite visualizar, organizar e gerenciar dados acadêmicos de forma simples e eficiente.

A aplicação pode funcionar localmente ou integrada a um banco de dados em nuvem, oferecendo flexibilidade conforme o uso.

Funcionalidades
Visualização de alunos por curso
Importação de dados via planilha (.xlsx)
Exportação de dados organizados
Exclusão individual e em massa
Atualização automática de registros
Integração opcional com banco de dados
Funcionamento offline (modo local)
Execução do projeto
Rodando localmente

Abra o arquivo:

index.html

Nenhuma instalação adicional é necessária.

Integração com banco de dados

O projeto permite integração com banco em nuvem para persistência dos dados.

Importante: não versionar credenciais diretamente no código.

Estrutura do projeto
geracaotech/
├── index.html
├── css/
├── js/
├── supabase_schema.sql
Importação e Exportação

O sistema permite importar arquivos .xlsx e exportar relatórios organizados automaticamente.

Segurança

Boas práticas recomendadas:

Não armazenar credenciais no repositório
Utilizar variáveis de ambiente
Revogar qualquer credencial exposta
Status

Projeto em desenvolvimento.

Autor

Projeto desenvolvido no contexto do programa Geração Tech.

Licença

Uso educacional.