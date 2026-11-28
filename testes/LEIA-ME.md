# Testes do CCB v2 (navegador real, Playwright)
1. MariaDB local: importar `banco/estrutura.sql` e `banco/ccb/*.sql` num banco `ccb2_test`; `nucleo/config.php` de teste apontando para ele.
2. Usuários de teste (senha `Senha1234`, trocar_senha = 0): admin@t.test (admin), cora@t.test (coord), gil@t.test (gestao),
   paulo@t.test (procurador), sara@t.test (seguranca), teo@t.test (tecnico).
3. `php -S 127.0.0.1:8300 -t .` na raiz do projeto.
4. `node testes/fluxo_fase1.js <pasta das imagens>` — casas, grupos, chamados e aprovação (27 verificações).
   `node testes/telas.js <pasta> http://127.0.0.1:8300 <email>` — abre todas as telas do menu e lista erros.
