<?php
declare(strict_types=1);

/**
 * Testes de ponta a ponta (servidor HTTP real + banco real): Fase 2, v1.1.0 e Fase 3.
 * Rodar com: bash tests/executar.sh
 */

$BASE = getenv('CCB_URL') ?: 'http://127.0.0.1:8099/api';
$falhas = 0;
$total = 0;

final class Cliente
{
    private string $jar;
    public ?string $csrf = null;

    public function __construct(private string $base)
    {
        $this->jar = tempnam(sys_get_temp_dir(), 'ccbjar');
    }

    public function req(string $metodo, string $caminho, ?array $corpo = null, bool $comCsrf = true): array
    {
        $ch = curl_init($this->base . $caminho);
        $cab = ['Content-Type: application/json', 'Accept: application/json'];
        if ($comCsrf && $this->csrf) $cab[] = 'X-CSRF-Token: ' . $this->csrf;
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $metodo,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_COOKIEJAR      => $this->jar,
            CURLOPT_COOKIEFILE     => $this->jar,
            CURLOPT_HTTPHEADER     => $cab,
            CURLOPT_POSTFIELDS     => $corpo === null ? null : json_encode($corpo),
        ]);
        $txt = curl_exec($ch);
        $st = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $json = json_decode((string) $txt, true);
        if (is_array($json) && isset($json['csrf'])) $this->csrf = $json['csrf'];
        return [$st, $json ?? $txt];
    }

    public function entrar(string $email, string $senha): array
    {
        $this->req('GET', '/auth/sessao');
        return $this->req('POST', '/auth/login', ['email' => $email, 'senha' => $senha]);
    }
}

function ok(string $nome, bool $cond, mixed $info = null): void
{
    global $falhas, $total;
    $total++;
    if ($cond) {
        echo "  ✔ $nome\n";
    } else {
        $falhas++;
        echo "  ✘ $nome\n";
        if ($info !== null) echo '      → ' . json_encode($info, JSON_UNESCAPED_UNICODE) . "\n";
    }
}

function db(string $sql, array $p = []): array
{
    static $pdo;
    $pdo ??= new PDO('mysql:host=127.0.0.1;dbname=' . getenv('CCB_DB_NOME') . ';charset=utf8mb4', getenv('CCB_DB_USUARIO'), getenv('CCB_DB_SENHA'),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $st = $pdo->prepare($sql);
    $st->execute($p);
    return $st->fetchAll();
}

$SENHA = 'Senha1234';

// ------------------------------------------------------------------ Autenticação
echo "\nAutenticação\n";
$adminA = new Cliente($BASE);
[$st, $r] = $adminA->entrar('admin@a.test', $SENHA);
ok('administrador entra com e-mail e senha', $st === 200 && in_array('administrador', $r['usuario']['perfis'] ?? []), $r);
ok('primeiro acesso exige troca de senha', ($r['usuario']['trocar_senha'] ?? null) === true);

$hash = db("SELECT senha_hash FROM usuarios WHERE email = 'admin@a.test'")[0]['senha_hash'];
ok('senha guardada com Argon2id', str_starts_with($hash, '$argon2id$'));

$semCsrf = new Cliente($BASE);
$semCsrf->req('GET', '/auth/sessao');
[$st] = $semCsrf->req('POST', '/auth/login', ['email' => 'admin@a.test', 'senha' => $SENHA], false);
ok('requisição sem token CSRF é recusada (419)', $st === 419, $st);

$anon = new Cliente($BASE);
[$st] = $anon->req('GET', '/casas');
ok('sem login, dados são recusados (401)', $st === 401, $st);

$bruto = new Cliente($BASE);
$bruto->req('GET', '/auth/sessao');
$codigos = [];
for ($i = 0; $i < 6; $i++) {
    [$st] = $bruto->req('POST', '/auth/login', ['email' => 'alvo@a.test', 'senha' => 'errada' . $i]);
    $codigos[] = $st;
}
ok('5 senhas erradas bloqueiam novas tentativas (429)', $codigos[4] === 401 && $codigos[5] === 429, $codigos);
[$st] = $bruto->req('POST', '/auth/login', ['email' => 'alvo@a.test', 'senha' => $SENHA]);
ok('bloqueio vale mesmo com a senha certa', $st === 429, $st);

[$st, $r] = (new Cliente($BASE))->entrar('naoexiste@a.test', $SENHA);
ok('e-mail inexistente responde igual a senha errada', $st === 401 && $r['erro'] === 'E-mail ou senha incorretos.', $r);

[$st, $r] = $adminA->req('POST', '/auth/senha', ['senha_atual' => $SENHA, 'nova_senha' => 'curta']);
ok('senha fraca é recusada', $st === 422 && isset($r['campos']['nova_senha']), $r);
[$st] = $adminA->req('POST', '/auth/senha', ['senha_atual' => $SENHA, 'nova_senha' => 'NovaSenha99']);
[, $r] = $adminA->req('GET', '/auth/eu');
ok('troca de senha libera o acesso', $st === 200 && $r['trocar_senha'] === false, $r);

// ------------------------------------------------------------------ Organização
echo "\nGrupos e Casas de Oração\n";
[, $grupos] = $adminA->req('GET', '/grupos');
ok('tenant nasce com os 4 grupos', count($grupos) === 4, $grupos);
$g81 = $grupos[0]['id'];
$g82 = $grupos[1]['id'];

[$st, $r] = $adminA->req('POST', '/grupos', ['nome' => 'Grupo 8.1']);
ok('nome de grupo repetido é recusado', $st === 422, $r);

[$st, $casa1] = $adminA->req('POST', '/casas', ['grupo_id' => $g81, 'codigo' => 'CO-01', 'nome' => 'Casa Jardim', 'bairro' => 'Centro', 'cep' => '01001-000']);
ok('cria Casa de Oração', $st === 201 && $casa1['nome'] === 'Casa Jardim', $casa1);
[, $casa2] = $adminA->req('POST', '/casas', ['grupo_id' => $g81, 'codigo' => 'CO-02', 'nome' => 'Casa Vila Nova']);
[, $casa3] = $adminA->req('POST', '/casas', ['grupo_id' => $g82, 'codigo' => 'CO-03', 'nome' => 'Casa Bela Vista']);
$dml = db('SELECT tipo FROM locais_estoque WHERE casa_id = ?', [$casa1['id']]);
ok('casa nasce com seu DML Local', count($dml) === 1 && $dml[0]['tipo'] === 'local');

[$st, $r] = $adminA->req('POST', '/casas', ['grupo_id' => $g81, 'codigo' => 'CO-01', 'nome' => 'Duplicada']);
ok('código de casa repetido é recusado', $st === 422 && isset($r['campos']['codigo']), $r);
[$st, $r] = $adminA->req('POST', '/casas', ['grupo_id' => $g81, 'codigo' => 'CO-99', 'nome' => 'X', 'cep' => 'abc']);
ok('CEP inválido é recusado', $st === 422 && isset($r['campos']['cep']), $r);

$aud = db("SELECT COUNT(*) n FROM auditoria WHERE entidade = 'casas_oracao' AND acao = 'criar'");
ok('criação de casas fica na auditoria', (int) $aud[0]['n'] === 3, $aud);

[$st, $r] = $adminA->req('PUT', '/grupos/' . $g81, ['nome' => 'Grupo 8.1', 'ativo' => false]);
ok('não desativa grupo com casas ativas', $st === 422, $r);

// ------------------------------------------------------------------ Isolamento entre tenants
echo "\nIsolamento entre tenants\n";
$adminB = new Cliente($BASE);
$adminB->entrar('admin@b.test', $SENHA);
$adminB->req('POST', '/auth/senha', ['senha_atual' => $SENHA, 'nova_senha' => 'NovaSenha99']);
[, $gruposB] = $adminB->req('GET', '/grupos');
[, $casaB] = $adminB->req('POST', '/casas', ['grupo_id' => $gruposB[0]['id'], 'codigo' => 'CO-01', 'nome' => 'Casa do Tenant B']);
ok('outro tenant pode usar o mesmo código de casa', isset($casaB['id']), $casaB);

[$st] = $adminA->req('GET', '/casas/' . $casaB['id']);
ok('administrador A não abre casa do tenant B pelo ID (404)', $st === 404, $st);
[$st] = $adminA->req('PUT', '/casas/' . $casaB['id'], ['grupo_id' => $g81, 'codigo' => 'X', 'nome' => 'Invadida']);
ok('administrador A não edita casa do tenant B', $st === 404, $st);
[, $lista] = $adminA->req('GET', '/casas');
ok('lista de A não traz casas de B', !in_array($casaB['id'], array_column($lista, 'id'), true) && count($lista) === 3, $lista);
[$st, $r] = $adminA->req('POST', '/casas', ['grupo_id' => $gruposB[0]['id'], 'codigo' => 'CO-77', 'nome' => 'Casa com grupo alheio']);
ok('não cria casa em grupo de outro tenant', $st === 422 && isset($r['campos']['grupo_id']), $r);
[$st, $r] = $adminA->req('POST', '/usuarios', [
    'nome' => 'Intruso', 'email' => 'intruso@a.test', 'senha' => $SENHA,
    'perfis' => [['perfil' => 'casa_oracao']], 'casas' => [['casa_id' => $casaB['id'], 'funcao' => 'escrita']],
]);
ok('não vincula usuário a casa de outro tenant', $st === 422, $r);

$erroBanco = null;
try {
    db('INSERT INTO casas_oracao (tenant_id, grupo_id, codigo, nome) VALUES (?, ?, ?, ?)',
        [db("SELECT id FROM tenants WHERE slug = 'tenant-a'")[0]['id'], $gruposB[0]['id'], 'CO-X', 'Direto no banco']);
} catch (PDOException $e) {
    $erroBanco = $e->getCode();
}
ok('o próprio banco recusa casa ligada a grupo de outro tenant', $erroBanco === '23000', $erroBanco);

$erroCentral = null;
try {
    db("INSERT INTO locais_estoque (tenant_id, tipo, nome) VALUES (?, 'central', 'Segundo central')", [db("SELECT id FROM tenants WHERE slug = 'tenant-a'")[0]['id']]);
} catch (PDOException $e) {
    $erroCentral = $e->getCode();
}
ok('só existe um DML Central por tenant', $erroCentral === '23000', $erroCentral);

// ------------------------------------------------------------------ Usuários e perfis
echo "\nUsuários e escopo dos perfis\n";
$criar = fn(array $dados) => $adminA->req('POST', '/usuarios', $dados + ['senha' => $SENHA]);

[$st, $r] = $criar(['nome' => 'Sem Perfil', 'email' => 'semperfil@a.test', 'perfis' => []]);
ok('usuário sem perfil é recusado', $st === 422 && isset($r['campos']['perfis']), $r);
[$st, $r] = $criar(['nome' => 'Casa Sem Casa', 'email' => 'x1@a.test', 'perfis' => [['perfil' => 'casa_oracao']]]);
ok('perfil Casa de Oração exige casa vinculada', $st === 422 && isset($r['campos']['casas']), $r);
[$st, $r] = $criar(['nome' => 'Coord Sem Grupo', 'email' => 'x2@a.test', 'perfis' => [['perfil' => 'coordenacao_manutencao']]]);
ok('Coordenação de Manutenção exige grupo', $st === 422, $r);
[$st, $r] = $criar(['nome' => 'Orient Sem Casa', 'email' => 'x3@a.test', 'perfis' => [['perfil' => 'orientadora_cns']]]);
ok('Orientadora CNS exige o grupo (é por grupo)', $st === 422 && isset($r['campos']['perfis.0']), $r);

[$st, $uCasa] = $criar(['nome' => 'Maria da Escrita', 'email' => 'maria@a.test',
    'perfis' => [['perfil' => 'casa_oracao']], 'casas' => [['casa_id' => $casa1['id'], 'funcao' => 'escrita']]]);
ok('cria usuário da casa com função', $st === 201 && $uCasa['casas'][0]['funcao'] === 'escrita', $uCasa);
[$st] = $criar(['nome' => 'Duplicado', 'email' => 'MARIA@a.test',
    'perfis' => [['perfil' => 'casa_oracao']], 'casas' => [['casa_id' => $casa1['id'], 'funcao' => 'escrita']]]);
ok('e-mail repetido é recusado (sem diferenciar maiúsculas)', $st === 422, $st);
$criar(['nome' => 'João Coordenador', 'email' => 'joao@a.test', 'perfis' => [['perfil' => 'coordenacao_manutencao', 'grupo_id' => $g82]]]);
$criar(['nome' => 'Ana Orientadora', 'email' => 'ana@a.test', 'perfis' => [['perfil' => 'orientadora_cns', 'grupo_id' => $g81]]]);
$criar(['nome' => 'Paulo Gestão', 'email' => 'paulo@a.test', 'perfis' => [['perfil' => 'gestao_manutencao']]]);

$maria = new Cliente($BASE);
[, $r] = $maria->entrar('maria@a.test', $SENHA);
ok('usuária da casa vê só a própria casa', array_column($r['usuario']['casas'], 'id') === [$casa1['id']], $r['usuario']['casas'] ?? $r);
[$st] = $maria->req('GET', '/casas/' . $casa2['id']);
ok('usuária da casa não abre outra casa trocando o ID (404)', $st === 404, $st);
[$st] = $maria->req('POST', '/casas', ['grupo_id' => $g81, 'codigo' => 'CO-50', 'nome' => 'Tentativa']);
ok('usuária da casa não cadastra casas (403)', $st === 403, $st);
[$st] = $maria->req('GET', '/usuarios');
ok('usuária da casa não vê a lista de usuários (403)', $st === 403, $st);
[$st] = $maria->req('GET', '/auditoria');
ok('usuária da casa não vê a auditoria (403)', $st === 403, $st);
[, $r] = $maria->req('GET', '/casas/' . $casa1['id']);
ok('usuária da casa não vê dados de outros usuários', !isset($r['usuarios']), $r);

$joao = new Cliente($BASE);
$joao->entrar('joao@a.test', $SENHA);
[, $lista] = $joao->req('GET', '/casas');
ok('coordenação vê só as casas do seu grupo', array_column($lista, 'id') === [$casa3['id']], $lista);
[$st] = $joao->req('GET', '/casas/' . $casa1['id']);
ok('coordenação não abre casa de outro grupo', $st === 404, $st);
[, $gs] = $joao->req('GET', '/grupos');
ok('coordenação vê só o próprio grupo', array_column($gs, 'id') === [$g82], $gs);

$ana = new Cliente($BASE);
$ana->entrar('ana@a.test', $SENHA);
[, $lista] = $ana->req('GET', '/casas');
$ids = array_column($lista, 'id'); sort($ids);
ok('orientadora vê todas as casas do seu grupo (e só elas)', $ids === [$casa1['id'], $casa2['id']], $lista);

$paulo = new Cliente($BASE);
$paulo->entrar('paulo@a.test', $SENHA);
[, $lista] = $paulo->req('GET', '/casas');
ok('Gestão vê todas as casas do tenant', count($lista) === 3, $lista);
[$st] = $paulo->req('POST', '/casas', ['grupo_id' => $g81, 'codigo' => 'CO-60', 'nome' => 'Tentativa']);
ok('Gestão não administra cadastros (403)', $st === 403, $st);

// ------------------------------------------------------------------ Ciclo de vida do acesso
echo "\nCiclo de vida do acesso\n";
[, $adminEu] = $adminA->req('GET', '/auth/eu');
[$st, $r] = $adminA->req('PUT', '/usuarios/' . $adminEu['id'], ['nome' => 'Admin A', 'email' => 'admin@a.test', 'ativo' => true, 'perfis' => [['perfil' => 'gestao_manutencao']]]);
ok('administrador não remove o próprio perfil de Administrador', $st === 422, $r);

[$st] = $adminA->req('PUT', '/usuarios/' . $uCasa['id'], ['nome' => 'Maria da Escrita', 'email' => 'maria@a.test', 'ativo' => false,
    'perfis' => [['perfil' => 'casa_oracao']], 'casas' => [['casa_id' => $casa1['id'], 'funcao' => 'escrita']]]);
[$st2] = $maria->req('GET', '/casas');
ok('usuário desativado perde o acesso na hora, mesmo logado', $st === 200 && $st2 === 401, [$st, $st2]);
[$st] = (new Cliente($BASE))->entrar('maria@a.test', $SENHA);
ok('usuário desativado não consegue entrar', $st === 401, $st);

[$st] = $joao->req('POST', '/auth/logout');
[$st2] = $joao->req('GET', '/casas');
ok('após sair, a sessão não vale mais', $st === 200 && $st2 === 401, [$st, $st2]);

[$st, $r] = $adminA->req('PUT', '/configuracoes', ['alcada_coordenacao_max' => 1500]);
ok('alçada da Coordenação não pode passar a da Gestão', $st === 422, $r);
[$st, $r] = $adminA->req('PUT', '/configuracoes', ['alcada_coordenacao_max' => 450]);
ok('administrador ajusta alçadas do tenant', $st === 200 && $r['alcada_coordenacao_max'] === '450.00', $r);
[, $cfgB] = $adminB->req('GET', '/configuracoes');
ok('alteração não afeta outro tenant', $cfgB['alcada_coordenacao_max'] === '500.00', $cfgB);

[, $aud] = $adminA->req('GET', '/auditoria');
$temSenha = str_contains(json_encode($aud), 'argon2');
ok('auditoria nunca guarda hash de senha', !$temSenha);

require __DIR__ . '/testes_fase3.php';
require __DIR__ . '/testes_fase4.php';
require __DIR__ . '/testes_fase5.php';
require __DIR__ . '/testes_fase6.php';
require __DIR__ . '/testes_fase7.php';
require __DIR__ . '/testes_fase8.php';
require __DIR__ . '/testes_fase9.php';

echo "\n" . ($falhas === 0 ? "TODOS OS $total TESTES PASSARAM" : "$falhas DE $total TESTES FALHARAM") . "\n";
exit($falhas === 0 ? 0 : 1);
