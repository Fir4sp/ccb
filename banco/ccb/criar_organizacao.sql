-- CCB v2 — cria a organização (tenant) e o primeiro administrador. Rodar UMA vez, depois das migrações.
-- Troque o nome da organização e o e-mail. A senha provisória NÃO fica no GitHub: o Dev Xclim gera este arquivo na hora
-- da instalação, com uma senha aleatória (php -r 'echo password_hash("<senha>", PASSWORD_DEFAULT);'), troca o
-- __HASH_DA_SENHA_PROVISORIA__ e passa a senha ao Eneas fora do chat. A pessoa troca a senha no primeiro acesso.
INSERT INTO tenants (id, nome, slug) VALUES (1, 'CCB — Setor', 'ccb');
INSERT INTO modulos (chave, nome, estagio) VALUES ('os', 'Ordens de serviço', 'geral'), ('tarefas', 'Tarefas', 'geral');
INSERT INTO usuarios (id, tenant_id, nome, email, perfil, senha_hash, trocar_senha)
VALUES (1, 1, 'Administrador', 'admin@exemplo.com.br', 'admin', '__HASH_DA_SENHA_PROVISORIA__', 1);
INSERT INTO usuario_perfis (tenant_id, usuario_id, perfil) VALUES (1, 1, 'admin');
