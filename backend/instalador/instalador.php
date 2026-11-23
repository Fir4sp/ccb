<?php
declare(strict_types=1);

/**
 * Instalador web do Sistema CCB (uso único).
 * - Pede o código de instalação (enviado junto com o pacote).
 * - Testa o banco, grava config/config.local.php, cria as tabelas, a organização e o administrador.
 * - Ao terminar grava config/instalado.lock e não roda mais.
 */

use Ccb\{Db, Instalacao};

$raiz = dirname(__DIR__);
$lock = "$raiz/config/instalado.lock";
$arqConfig = "$raiz/config/config.local.php";
$arqCodigo = "$raiz/config/codigo_instalacao.php";

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

$h = static fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$v = static fn(string $k, string $padrao = '') => trim((string) ($_POST[$k] ?? $padrao));

$erros = [];
$feito = null;

if (is_file($lock)) {
    $feito = 'ja';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // 1. Código de instalação
    $hashCodigo = is_file($arqCodigo) ? (require $arqCodigo) : null;
    if (!$hashCodigo || !password_verify($v('codigo'), $hashCodigo)) {
        sleep(2);
        $erros[] = 'Código de instalação incorreto. Ele está no Guia de Instalação (PDF).';
    }

    // 2. Campos
    $senha = (string) ($_POST['admin_senha'] ?? '');
    if ($v('db_nome') === '' || $v('db_usuario') === '') $erros[] = 'Preencha o nome e o usuário do banco de dados.';
    if ($v('org_nome') === '') $erros[] = 'Preencha o nome da organização.';
    if ($v('admin_nome') === '') $erros[] = 'Preencha o nome do administrador.';
    if (!filter_var($v('admin_email'), FILTER_VALIDATE_EMAIL)) $erros[] = 'E-mail do administrador inválido.';
    if (mb_strlen($senha) < 8 || !preg_match('/[A-Za-z]/', $senha) || !preg_match('/\d/', $senha)) {
        $erros[] = 'A senha do administrador precisa ter 8 caracteres ou mais, com letras e números.';
    } elseif ($senha !== (string) ($_POST['admin_senha2'] ?? '')) {
        $erros[] = 'As duas senhas do administrador não são iguais.';
    }
    $demo = isset($_POST['demo']);
    $senhaDemo = (string) ($_POST['demo_senha'] ?? '');
    if ($demo && (mb_strlen($senhaDemo) < 8 || !preg_match('/[A-Za-z]/', $senhaDemo) || !preg_match('/\d/', $senhaDemo))) {
        $erros[] = 'A senha dos usuários de demonstração precisa ter 8 caracteres ou mais, com letras e números.';
    }

    // 3. Testa o banco antes de gravar qualquer coisa
    $db = ['host' => $v('db_host', 'localhost') ?: 'localhost', 'port' => 3306, 'nome' => $v('db_nome'), 'usuario' => $v('db_usuario'), 'senha' => (string) ($_POST['db_senha'] ?? '')];
    if (!$erros) {
        try {
            new PDO("mysql:host={$db['host']};port=3306;dbname={$db['nome']};charset=utf8mb4", $db['usuario'], $db['senha'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
        } catch (PDOException $e) {
            $erros[] = 'Não foi possível conectar ao banco. Confira o nome do banco, o usuário e a senha criados no hPanel (o servidor quase sempre é "localhost").';
        }
    }

    // 4. Instala
    if (!$erros) {
        $conteudo = "<?php\n// Gerado pelo instalador em " . date('d/m/Y H:i') . ". Não compartilhe este arquivo.\nreturn " . var_export(['ambiente' => 'producao', 'db' => $db], true) . ";\n";
        if (@file_put_contents($arqConfig, $conteudo) === false) {
            $erros[] = 'Sem permissão para gravar o arquivo de configuração na pasta ccb_app/config. Ajuste a permissão da pasta para 755 no Gerenciador de Arquivos e tente de novo.';
        } else {
            @chmod($arqConfig, 0600);
            require_once "$raiz/src/bootstrap.php";
            try {
                Instalacao::migrar();
                $temOrg = (int) Db::one('SELECT COUNT(*) n FROM tenants')['n'] > 0;
                if ($temOrg) {
                    $erros[] = 'Este banco já tem uma organização cadastrada. Use um banco novo e vazio para instalar.';
                } else {
                    $grupos = array_filter(array_map('trim', explode(',', $v('grupos', '8.1, 8.2, 8.3, 8.4'))));
                    $tenant = Instalacao::criarTenant($v('org_nome'), 'principal', $v('admin_nome'), $v('admin_email'), $senha, $grupos);
                    if ($demo) Instalacao::dadosExemplo($tenant, $senhaDemo);
                    file_put_contents($lock, 'Instalado em ' . date('c'));
                    @unlink($arqCodigo);
                    $feito = $demo ? 'demo' : 'ok';
                }
            } catch (InvalidArgumentException | RuntimeException $e) {
                $erros[] = $e->getMessage();
            } catch (Throwable $e) {
                error_log('[CCB instalador] ' . $e->getMessage());
                $erros[] = 'Erro ao criar as tabelas: ' . $e->getMessage();
            }
        }
    }
}
?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Instalação — Sistema CCB</title>
<style>
  :root { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 17px; color: #17262b; background: #f4f6f5; }
  body { margin: 0; padding: 24px 16px 48px; }
  main { max-width: 620px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  .sub { color: #4d5f64; margin: 0 0 24px; }
  fieldset { border: 0; background: #fff; border-radius: 14px; padding: 18px; margin: 0 0 16px; box-shadow: 0 1px 2px rgb(23 38 43 / 6%), 0 2px 8px rgb(23 38 43 / 5%); }
  fieldset > :not(legend) { clear: both; }
  legend { float: left; width: 100%; font-weight: 700; font-size: 1.1rem; margin-bottom: 6px; }
  label { display: block; font-weight: 600; font-size: .95rem; margin: 12px 0 6px; }
  small { display: block; color: #6f7f83; font-weight: 400; font-size: .85rem; margin-top: 4px; }
  input[type=text], input[type=password], input[type=email] { width: 100%; box-sizing: border-box; min-height: 50px; padding: 0 14px; border: 1px solid #b9c5c2; border-radius: 12px; font: inherit; }
  .caixa { display: flex; gap: 10px; align-items: flex-start; font-weight: 600; }
  .caixa input { width: 22px; height: 22px; margin: 2px 0 0; }
  button, .botao { display: block; width: 100%; min-height: 54px; border: 0; border-radius: 12px; background: #1e4d5c; color: #fff; font: inherit; font-weight: 700; text-align: center; line-height: 54px; text-decoration: none; cursor: pointer; }
  .erro { background: #fdecea; color: #b3261e; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-weight: 600; }
  .erro p { margin: 4px 0; }
  .ok { background: #e5f4ea; color: #1d6b3a; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  .ok h2 { margin: 0 0 8px; }
  ol { padding-left: 22px; } li { margin: 6px 0; }
  code { background: #eef2f1; padding: 2px 6px; border-radius: 6px; }
</style>
</head>
<body>
<main>
  <h1>Instalação do Sistema CCB</h1>
  <p class="sub">Preencha uma única vez. Depois disso esta página se desliga sozinha.</p>

<?php if ($feito === 'ja'): ?>
  <div class="ok">
    <h2>O sistema já está instalado.</h2>
    <p>Por segurança, apague o arquivo <code>instalar.php</code> pelo Gerenciador de Arquivos da Hostinger.</p>
  </div>
  <a class="botao" href="./">Abrir o Sistema CCB</a>

<?php elseif ($feito): ?>
  <div class="ok">
    <h2>Instalação concluída.</h2>
    <ol>
      <li>Apague o arquivo <code>instalar.php</code> pelo Gerenciador de Arquivos da Hostinger.</li>
      <li>Abra o sistema e entre com o e-mail <strong><?= $h($v('admin_email')) ?></strong> e a senha que você acabou de criar. No primeiro acesso, o sistema pede uma senha nova.</li>
      <?php if ($feito === 'demo'): ?>
      <li>Os 11 usuários de demonstração usam e-mails <code>@demo.ccb</code> (ex.: <code>casa@demo.ccb</code>, <code>gestao@demo.ccb</code>) e a senha que você definiu para eles.</li>
      <?php endif; ?>
    </ol>
  </div>
  <a class="botao" href="./">Abrir o Sistema CCB</a>

<?php else: ?>
  <?php if ($erros): ?>
  <div class="erro" role="alert"><?php foreach ($erros as $e): ?><p><?= $h($e) ?></p><?php endforeach; ?></div>
  <?php endif; ?>

  <form method="post" autocomplete="off">
    <fieldset>
      <legend>1. Código de instalação</legend>
      <label for="codigo">Código</label>
      <input type="text" id="codigo" name="codigo" required value="<?= $h($v('codigo')) ?>">
      <small>Está no Guia de Instalação (PDF) que veio com o pacote.</small>
    </fieldset>

    <fieldset>
      <legend>2. Banco de dados</legend>
      <small>Os dados do banco que você criou no hPanel, em "Bancos de dados MySQL".</small>
      <label for="db_nome">Nome do banco</label>
      <input type="text" id="db_nome" name="db_nome" required placeholder="ex.: u123456789_ccb" value="<?= $h($v('db_nome')) ?>">
      <label for="db_usuario">Usuário do banco</label>
      <input type="text" id="db_usuario" name="db_usuario" required placeholder="ex.: u123456789_ccb" value="<?= $h($v('db_usuario')) ?>">
      <label for="db_senha">Senha do banco</label>
      <input type="password" id="db_senha" name="db_senha" required>
      <label for="db_host">Servidor</label>
      <input type="text" id="db_host" name="db_host" value="<?= $h($v('db_host', 'localhost')) ?>">
      <small>Deixe "localhost", a não ser que o hPanel mostre outro.</small>
    </fieldset>

    <fieldset>
      <legend>3. Organização</legend>
      <label for="org_nome">Nome da organização</label>
      <input type="text" id="org_nome" name="org_nome" required value="<?= $h($v('org_nome', 'Administração Regional')) ?>">
      <label for="grupos">Grupos</label>
      <input type="text" id="grupos" name="grupos" value="<?= $h($v('grupos', '8.1, 8.2, 8.3, 8.4')) ?>">
      <small>Separados por vírgula. Dá para criar outros depois, pelo sistema.</small>
    </fieldset>

    <fieldset>
      <legend>4. Administrador</legend>
      <label for="admin_nome">Seu nome</label>
      <input type="text" id="admin_nome" name="admin_nome" required value="<?= $h($v('admin_nome')) ?>">
      <label for="admin_email">Seu e-mail (usado para entrar)</label>
      <input type="email" id="admin_email" name="admin_email" required value="<?= $h($v('admin_email')) ?>">
      <label for="admin_senha">Senha</label>
      <input type="password" id="admin_senha" name="admin_senha" required>
      <small>8 caracteres ou mais, com letras e números.</small>
      <label for="admin_senha2">Repita a senha</label>
      <input type="password" id="admin_senha2" name="admin_senha2" required>
    </fieldset>

    <fieldset>
      <legend>5. Dados de demonstração</legend>
      <label class="caixa"><input type="checkbox" name="demo" <?= isset($_POST['demo']) || $_SERVER['REQUEST_METHOD'] !== 'POST' ? 'checked' : '' ?>> Criar 32 casas de exemplo e um usuário de cada perfil</label>
      <small>Use só no ambiente de teste, para mostrar o sistema à coordenação. Os dados reais entram depois, num banco novo.</small>
      <label for="demo_senha">Senha dos usuários de demonstração</label>
      <input type="text" id="demo_senha" name="demo_senha" value="<?= $h($v('demo_senha', 'Demo2026x')) ?>">
    </fieldset>

    <button type="submit">Instalar</button>
  </form>
<?php endif; ?>
</main>
</body>
</html>
