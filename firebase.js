// ==========================================
// firebase.js - Configuração e funções do Firebase
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, getDoc, doc, updateDoc, deleteDoc, runTransaction, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBb8UGRV8qcjV6-_kd7WucWhoJBKSHcUac",
    authDomain: "mpleaoerp.firebaseapp.com",
    projectId: "mpleaoerp",
    storageBucket: "mpleaoerp.firebasestorage.app",
    messagingSenderId: "806362757682",
    appId: "1:806362757682:web:3cefbea0483af0ef251a2b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==========================================
// EXPORTA FUNÇÕES DO FIREBASE PARA USO GLOBAL
// ==========================================
window.db = db;
window.collection = collection;
window.addDoc = addDoc;
window.serverTimestamp = serverTimestamp;
window.getDocs = getDocs;
window.doc = doc;
window.updateDoc = updateDoc;
window.deleteDoc = deleteDoc;
window.runTransaction = runTransaction;
window.writeBatch = writeBatch;

// ==========================================
// PROTEÇÃO DE ACESSO
// ==========================================
let loginVerificado = false;

// Gera um ID único por aba — sobrevive a F5 mas não a fechar e reabrir
if (!sessionStorage.getItem('tabId')) {
    sessionStorage.setItem('tabId', Date.now().toString());
}
const _tabId = sessionStorage.getItem('tabId');

// sessionStorage sobrevive ao "continuar de onde parou" do Chrome
// Por isso usamos uma combinação: sessionStorage + flag na memória da página
// A flag _paginaCarregouNessaSessao é false ao abrir uma nova aba/janela
// mas true ao fazer F5 (a variável JS sobrevive ao reload via bfcache)
let _paginaCarregouNessaSessao = false;

// Ao carregar a página: verifica se o tabId já estava registrado no sessionStorage
// Se não estava (aba nova/navegador reaberto), força login
const _tabAtiva = sessionStorage.getItem('sessaoAtiva_' + _tabId);
if (!_tabAtiva) {
    // Aba nova ou navegador reaberto — precisa logar
    sessionStorage.clear();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('login.html');
        return;
    }

    // Usuário Firebase existe — verifica se tem sessão local válida
    if (!sessionStorage.getItem('userLogged')) {
        // Token Firebase ainda válido mas sessão local não existe
        // (navegador foi fechado e reaberto) — força logout
        signOut(auth).then(() => window.location.replace('login.html'));
        return;
    }

    if (!loginVerificado) {
        loginVerificado = true;
        // Registra/atualiza o usuário na coleção 'usuarios' (para aparecer no painel admin)
        try {
            const userRef = doc(db, 'usuarios', user.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
                await setDoc(userRef, { email: user.email, uid: user.uid, admin: false, criado_em: new Date().toISOString() });
            } else if (!userSnap.data().email) {
                await setDoc(userRef, { email: user.email }, { merge: true });
            }
        } catch(e) { console.warn('Erro ao registrar usuário:', e); }
        carregarMemoriaBanco();
    }
});

window.fazerLogout = function() {
    sessionStorage.removeItem('userLogged');
    sessionStorage.removeItem('sessaoAtiva_' + _tabId);
    liberarTodosLocksDoUsuario(); // fire and forget — não bloqueia o logout
    signOut(auth).then(() => window.location.replace('login.html'));
};

// ==========================================
// SISTEMA DE LOCK PESSIMISTA
// ==========================================
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutos sem atividade = lock expira
let _lockAtivo = null; // { tipo, id, lockId }
let _lockHeartbeatInterval = null;

function nomeUsuarioAtual() {
    const u = auth.currentUser;
    return u ? (u.displayName || u.email || 'Usuário') : 'Usuário';
}

async function tentarAcquireLock(tipo, id) {
    const lockId = `${tipo}_${id}`;
    const lockRef = doc(db, 'locks', lockId);

    try {
        const snap = await getDoc(lockRef);
        if (snap.exists()) {
            const data = snap.data();
            const agora = Date.now();
            const desde = data.desde?.toMillis ? data.desde.toMillis() : agora;
            // Verifica se o lock expirou
            if (agora - desde < LOCK_TTL_MS) {
                // Lock ativo de outro usuário
                const meuEmail = auth.currentUser?.email || '';
                if (data.usuarioEmail !== meuEmail) {
                    const minutos = Math.floor((agora - desde) / 60000);
                    const tempo = minutos > 0 ? `há ${minutos} min` : 'agora mesmo';
                    return { bloqueado: true, usuario: data.usuario, tempo };
                }
                // É meu próprio lock — renova e continua
            }
        }

        // Adquire ou renova o lock
        await setDoc(lockRef, {
            tipo,
            id,
            usuario: nomeUsuarioAtual(),
            usuarioEmail: auth.currentUser?.email || '',
            desde: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        _lockAtivo = { tipo, id, lockId };
        _iniciarHeartbeat(lockRef);
        return { bloqueado: false };

    } catch (e) {
        console.warn('Erro ao adquirir lock:', e);
        return { bloqueado: false }; // falha silenciosa — não bloqueia o usuário
    }
}

function _iniciarHeartbeat(lockRef) {
    if (_lockHeartbeatInterval) clearInterval(_lockHeartbeatInterval);
    _lockHeartbeatInterval = setInterval(async () => {
        try {
            if (_lockAtivo) {
                await updateDoc(lockRef, { updatedAt: serverTimestamp() });
            }
        } catch(e) { /* silencioso */ }
    }, 2 * 60 * 1000); // renova a cada 2 min
}

async function liberarLock() {
    if (!_lockAtivo) return;
    try {
        const lockRef = doc(db, 'locks', _lockAtivo.lockId);
        const snap = await getDoc(lockRef);
        if (snap.exists() && snap.data().usuarioEmail === auth.currentUser?.email) {
            await deleteDoc(lockRef);
        }
    } catch(e) { console.warn('Erro ao liberar lock:', e); }
    finally {
        _lockAtivo = null;
        if (_lockHeartbeatInterval) { clearInterval(_lockHeartbeatInterval); _lockHeartbeatInterval = null; }
    }
}

async function liberarTodosLocksDoUsuario() {
    try {
        const email = auth.currentUser?.email;
        if (!email) return;
        const snap = await getDocs(collection(db, 'locks'));
        const batch = writeBatch(db);
        snap.forEach(d => { if (d.data().usuarioEmail === email) batch.delete(d.ref); });
        await batch.commit();
    } catch(e) { console.warn('Erro ao liberar locks:', e); }
}

// Distingue F5 (reload) de fechar a aba
// pagehide com persisted=false = aba sendo fechada de verdade
// pagehide com persisted=true  = página indo pro bfcache (navegação normal)
// beforeunload sozinho não distingue os dois casos
window.addEventListener('pagehide', (e) => {
    if (!e.persisted) {
        // Aba/janela fechando de verdade — limpa sessão
        sessionStorage.removeItem('userLogged');
        sessionStorage.removeItem('sessaoAtiva_' + _tabId);
    }
    // F5 ou navegação: não limpa nada, sessão continua válida

    if (_lockAtivo) {
        try { deleteDoc(doc(db, 'locks', _lockAtivo.lockId)); } catch(e) {}
        _lockAtivo = null;
    }
});

window.tentarAcquireLock = tentarAcquireLock;
window.liberarLock = liberarLock;

// ==========================================
// MOVIMENTAÇÃO DE ESTOQUE
// ==========================================
async function descontarEstoque(itens) {
    // Usa transação para garantir atomicidade — ou desconta tudo ou não desconta nada
    try {
        await runTransaction(db, async (t) => {
            for (const item of itens) {
                if (!item.produto_id) continue;
                const prodRef = doc(db, 'produtos', item.produto_id);
                const prodSnap = await t.get(prodRef);
                if (!prodSnap.exists()) continue;
                const estoqueAtual = prodSnap.data().estoque_atual || 0;
                const qtd = parseFloat(item.quantidade) || 0;
                t.update(prodRef, { estoque_atual: Math.max(0, estoqueAtual - qtd) });
            }
        });
        console.log('📦 Estoque descontado com sucesso');
    } catch(e) {
        console.error('Erro ao descontar estoque:', e);
        throw e;
    }
}

async function estornarEstoque(itens) {
    try {
        await runTransaction(db, async (t) => {
            for (const item of itens) {
                if (!item.produto_id) continue;
                const prodRef = doc(db, 'produtos', item.produto_id);
                const prodSnap = await t.get(prodRef);
                if (!prodSnap.exists()) continue;
                const estoqueAtual = prodSnap.data().estoque_atual || 0;
                const qtd = parseFloat(item.quantidade) || 0;
                t.update(prodRef, { estoque_atual: estoqueAtual + qtd });
            }
        });
        console.log('📦 Estoque estornado com sucesso');
    } catch(e) {
        console.error('Erro ao estornar estoque:', e);
        throw e;
    }
}

// ==========================================
// VARIÁVEIS GLOBAIS
// ==========================================
window.bancoClientes = [];
window.bancoProdutos = [];
window.bancoPedidos = [];
window.bancoParcelas = [];

// ==========================================
// FUNÇÕES DE CEP
// ==========================================
window.buscarCEPCadastro = async function() {
    const inputCEP = document.getElementById('cli-cep');
    const statusEl = document.getElementById('cep-status-cadastro');
    const cep = inputCEP.value.replace(/\D/g, '');

    if (cep.length !== 8) {
        statusEl.innerHTML = '⚠️ CEP inválido (deve ter 8 dígitos)';
        statusEl.className = 'text-xs mt-1 text-red-600';
        return;
    }

    statusEl.innerHTML = '🔍 Consultando...';
    statusEl.className = 'text-xs mt-1 text-blue-600';

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            statusEl.innerHTML = '❌ CEP não encontrado';
            statusEl.className = 'text-xs mt-1 text-red-600';
            return;
        }

        let enderecoCompleto = data.logradouro || '';
        if (data.bairro) enderecoCompleto += `, ${data.bairro}`;
        enderecoCompleto += ` - ${data.localidade}/${data.uf}`;

        document.getElementById('cli-endereco').value = enderecoCompleto;
        statusEl.innerHTML = `✅ Endereço encontrado!`;
        statusEl.className = 'text-xs mt-1 text-green-600';

    } catch (error) {
        console.error('Erro na consulta de CEP:', error);
        statusEl.innerHTML = '❌ Erro ao consultar CEP';
        statusEl.className = 'text-xs mt-1 text-red-600';
    }
};

// ==========================================
// FUNÇÃO PARA CARREGAR DADOS DO CLIENTE
// ==========================================
window.carregarDadosCliente = function() {
    const selectCliente = document.getElementById('input-cliente');
    const nomeCliente = selectCliente ? selectCliente.value : '';
    const cliente = window.bancoClientes.find(c => c.nome === nomeCliente);

    const container = document.getElementById('dados-cliente-container');
    const telefoneSpan = document.getElementById('cliente-telefone');
    const documentoSpan = document.getElementById('cliente-documento');
    const enderecoSpan = document.getElementById('cliente-endereco');
    const cepSpan = document.getElementById('cliente-cep');
    const inputEndereco = document.getElementById('input-endereco');

    if (cliente) {
        container.classList.remove('hidden');
        telefoneSpan.innerText = cliente.telefone || '-';
        documentoSpan.innerText = cliente.documento || '-';
        enderecoSpan.innerText = cliente.endereco || '-';
        cepSpan.innerText = cliente.cep || '-';
        inputEndereco.value = cliente.endereco || '';
        calcularTudo();
    } else {
        container.classList.add('hidden');
        inputEndereco.value = '';
    }
};

// ==========================================
// FUNÇÕES DE PRODUTO
// ==========================================
window.preencherProduto = function(select) {
    if (!select) return;
    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption || !selectedOption.value) return;

    const valor = selectedOption.dataset.valor;
    const fornecedor = selectedOption.dataset.forn;
    const tr = select.closest('tr');
    if (!tr) return;

    // CORRIGIDO: atualiza o produto_id na linha quando o usuário troca o produto
    tr.dataset.produtoId = selectedOption.value; // value agora é o id do produto

    const valorItem = tr.querySelector('.valor-item');
    const fornItem = tr.querySelector('.forn-item');

    if (valorItem) valorItem.value = window.formatarValorReais(parseFloat(valor));
    if (fornItem) fornItem.value = fornecedor || '';

    window.calcularTudo();
};

// ==========================================
// FUNÇÕES FINANCEIRAS
// ==========================================
window.atualizarParcelas = function() {
    const condicao = document.getElementById('select-condicao-pagamento').value;
    const divPersonalizado = document.getElementById('div-parcelas-personalizado');

    if (condicao === 'Personalizado') {
        divPersonalizado.classList.remove('hidden');
    } else {
        divPersonalizado.classList.add('hidden');
    }
};

async function gerarParcelas(pedidoId, clienteNome, valorTotal, condicao, primeiroVencimento) {
    let numeroParcelas = 1;

    if (condicao === 'Vista') {
        numeroParcelas = 1;
    } else if (condicao === 'Personalizado') {
        numeroParcelas = parseInt(document.getElementById('input-parcelas')?.value) || 1;
    } else {
        numeroParcelas = parseInt(condicao.replace('x', '')) || 1;
    }

    // Busca o cliente para vincular código e ID — vínculo permanente pelo código
    const clienteObj = window.bancoClientes.find(c => c.nome === clienteNome);
    const clienteId     = clienteObj?.id     || '';
    const clienteCodigo = clienteObj?.codigo || '';

    const valorParcela = valorTotal / numeroParcelas;
    let dataVencimento = primeiroVencimento ? new Date(primeiroVencimento + 'T12:00:00') : new Date();

    for (let i = 0; i < numeroParcelas; i++) {
        const vencimento = new Date(dataVencimento);
        vencimento.setMonth(vencimento.getMonth() + i);

        const parcela = {
            pedidoId:      pedidoId,
            clienteNome:   clienteNome,   // atualizado automaticamente se o nome mudar
            clienteId:     clienteId,     // vínculo permanente pelo UID do Firebase
            clienteCodigo: clienteCodigo, // vínculo permanente pelo código sequencial
            numeroParcela: i + 1,
            totalParcelas: numeroParcelas,
            vencimento:    vencimento.toISOString().split('T')[0],
            valor:         valorParcela,
            status:        'pendente',
            dataPagamento: null,
            dataCriacao:   new Date().toISOString()
        };

        try {
            await addDoc(collection(db, "parcelas"), parcela);
        } catch (error) {
            console.error('Erro ao salvar parcela:', error);
        }
    }
}

// ==========================================
// CANCELAR PARCELAS DE UM PEDIDO
// ==========================================
async function cancelarParcelasDoPedido(pedidoId) {
    try {
        const parcelasSnap = await getDocs(collection(db, "parcelas"));
        const batch = writeBatch(db);
        let contador = 0;

        parcelasSnap.forEach(docSnap => {
            if (docSnap.data().pedidoId === pedidoId && docSnap.data().status === 'pendente') {
                batch.update(docSnap.ref, { status: 'cancelado' });
                contador++;
            }
        });

        if (contador > 0) {
            await batch.commit();
            console.log(`${contador} parcelas canceladas`);
        }
    } catch (error) {
        console.error('Erro ao cancelar parcelas:', error);
    }
}

window.receberParcela = async function(parcelaId) {
    const result = await Swal.fire({
        title: 'Confirmar recebimento',
        text: 'Deseja marcar esta parcela como recebida?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sim, receber',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
        const parcelaRef = doc(db, "parcelas", parcelaId);
        await updateDoc(parcelaRef, {
            status: 'pago',
            dataPagamento: new Date().toISOString().split('T')[0]
        });

        await Swal.fire({
            icon: 'success',
            title: 'Recebido!',
            text: 'Parcela marcada como paga com sucesso.',
            timer: 2000,
            showConfirmButton: false
        });

        await carregarParcelasDoFirebase();
        window.carregarDadosFinanceiros();

    } catch (error) {
        console.error('Erro ao receber parcela:', error);
        Swal.fire({
            icon: 'error',
            title: 'Erro',
            text: 'Erro ao registrar pagamento!',
            confirmButtonColor: '#3b82f6'
        });
    }
};

async function carregarParcelasDoFirebase() {
    try {
        const parcelasSnap = await getDocs(collection(db, "parcelas"));
        window.bancoParcelas = parcelasSnap.docs.map(docSnap => ({
            firebaseId: docSnap.id,
            ...docSnap.data()
        }));
        console.log(`📊 ${window.bancoParcelas.length} parcelas carregadas`);
    } catch (error) {
        console.error('Erro ao carregar parcelas:', error);
        window.bancoParcelas = [];
    }
}

window.carregarDadosFinanceiros = async function() {
    await carregarParcelasDoFirebase();

    let totalReceber = 0;
    let totalVencer = 0;
    let totalAtrasado = 0;
    let totalRecebidoMes = 0;

    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const valoresPorMes = [0, 0, 0, 0, 0, 0];

    window.bancoParcelas.forEach(parcela => {
        // Ignora parcelas canceladas nos totais
        if (parcela.status === 'cancelado') return;

        const valor = parseFloat(parcela.valor) || 0;
        const vencimento = new Date(parcela.vencimento + 'T12:00:00');
        const diasAteVencimento = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));

        if (parcela.status === 'pendente') {
            totalReceber += valor;

            if (diasAteVencimento < 0) {
                totalAtrasado += valor;
            } else if (diasAteVencimento <= 30) {
                totalVencer += valor;
            }

            const diffMeses = (vencimento.getMonth() - hoje.getMonth()) +
                (vencimento.getFullYear() - hoje.getFullYear()) * 12;
            if (diffMeses >= 0 && diffMeses < 6) {
                valoresPorMes[diffMeses] += valor;
            }

        } else if (parcela.status === 'pago') {
            const dataPagamento = parcela.dataPagamento ? new Date(parcela.dataPagamento + 'T12:00:00') : null;
            if (dataPagamento &&
                dataPagamento.getMonth() === mesAtual &&
                dataPagamento.getFullYear() === anoAtual) {
                totalRecebidoMes += valor;
            }
        }
    });

    document.getElementById('total-a-receber').innerText = window.formatarValorReais(totalReceber);
    document.getElementById('total-a-vencer').innerText = window.formatarValorReais(totalVencer);
    document.getElementById('total-atrasado').innerText = window.formatarValorReais(totalAtrasado);
    document.getElementById('total-recebido-mes').innerText = window.formatarValorReais(totalRecebidoMes);

    const maxValor = Math.max(...valoresPorMes, 1);
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun'];

    for (let i = 0; i < 6; i++) {
        const barra = document.getElementById(`barra-${meses[i]}`);
        if (barra) {
            const altura = valoresPorMes[i] > 0 ? (valoresPorMes[i] / maxValor) * 140 : 0;
            barra.style.height = altura + 'px';
            barra.title = window.formatarValorReais(valoresPorMes[i]);
        }
    }

    const selectCliente = document.getElementById('filtro-cliente-financeiro');
    if (selectCliente) {
        selectCliente.innerHTML = '<option value="todos">Todos os clientes</option>';
        window.bancoClientes.forEach(c => {
            selectCliente.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
        });
    }

    window.filtrarFinanceiro();
};

window.filtrarFinanceiro = function() {
    const statusFiltro = document.getElementById('filtro-status-financeiro')?.value || 'todos';
    const clienteFiltro = document.getElementById('filtro-cliente-financeiro')?.value || 'todos';
    const busca = document.getElementById('busca-financeiro')?.value.toLowerCase() || '';

    const hoje = new Date();

    let parcelasFiltradas = window.bancoParcelas.filter(p => {
        // Por padrão, oculta canceladas a menos que o filtro seja "cancelado"
        if (statusFiltro === 'todos' && p.status === 'cancelado') return false;

        if (statusFiltro !== 'todos') {
            if (statusFiltro === 'atrasado') {
                const vencimento = new Date(p.vencimento + 'T12:00:00');
                const dias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));
                if (p.status !== 'pendente' || dias >= 0) return false;
            } else if (p.status !== statusFiltro) {
                return false;
            }
        }

        if (clienteFiltro !== 'todos' && (p.clienteNome || p.cliente) !== clienteFiltro) return false;

        if (busca) {
            const clienteMatch = (p.clienteNome || p.cliente || '').toLowerCase().includes(busca);
            const pedidoMatch = p.pedidoId?.toLowerCase().includes(busca);
            if (!clienteMatch && !pedidoMatch) return false;
        }

        return true;
    });

    parcelasFiltradas.sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));

    let html = '';

    if (parcelasFiltradas.length === 0) {
        html = '<tr><td colspan="8" class="p-4 text-center text-gray-500">Nenhuma parcela encontrada</td></tr>';
    } else {
        parcelasFiltradas.forEach(p => {
            const vencimento = new Date(p.vencimento + 'T12:00:00');
            const diasAteVencimento = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));

            let statusClass = '';
            let statusText = '';
            let diasTexto = '';
            let diasClass = '';
            let linhaClass = '';

            if (p.status === 'cancelado') {
                statusClass = 'bg-gray-400';
                statusText = 'Cancelado';
                diasTexto = '-';
                diasClass = 'text-gray-400';
                linhaClass = 'opacity-60';
            } else if (p.status === 'pago') {
                statusClass = 'badge-pago';
                statusText = 'Pago';
                diasTexto = 'Pago';
                diasClass = 'text-green-600';
                linhaClass = 'status-pago';
            } else if (diasAteVencimento < 0) {
                statusClass = 'badge-atrasado';
                statusText = 'Atrasado';
                diasTexto = `${Math.abs(diasAteVencimento)} dias atrasado`;
                diasClass = 'text-red-600 font-bold';
                linhaClass = 'status-atrasado';
            } else if (diasAteVencimento === 0) {
                statusClass = 'badge-pendente';
                statusText = 'Vence hoje';
                diasTexto = 'Vence hoje';
                diasClass = 'text-orange-600 font-bold';
                linhaClass = 'status-pendente';
            } else {
                statusClass = 'badge-pendente';
                statusText = 'A Receber';
                diasTexto = `Faltam ${diasAteVencimento} dias`;
                diasClass = 'text-yellow-600';
                linhaClass = 'status-pendente';
            }

            const pedido = window.bancoPedidos.find(ped => ped.id === p.pedidoId);
            const numeroPedido = pedido?.numero_sequencial
                ? `#${pedido.numero_sequencial.toString().padStart(3, '0')}`
                : p.pedidoId.substring(0, 6);

            const parcelaTexto = p.totalParcelas > 1 ? `${p.numeroParcela}/${p.totalParcelas}` : 'Única';

            html += `
            <tr class="border-b hover:bg-gray-50 ${linhaClass}">
                <td class="p-2 border">${p.clienteNome || p.cliente || '-'}</td>
                <td class="p-2 border font-bold">${numeroPedido}</td>
                <td class="p-2 border">${parcelaTexto}</td>
                <td class="p-2 border">${window.formatarDataParaExibir(p.vencimento)}</td>
                <td class="p-2 border">${window.formatarValorReais(p.valor)}</td>
                <td class="p-2 border">
                    <span class="px-2 py-1 rounded-full text-xs font-medium text-white ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="p-2 border ${diasClass}">${diasTexto}</td>
                <td class="p-2 border">
                    ${p.status === 'pendente' ? `
                        <button onclick="window.receberParcela('${p.firebaseId}')" class="text-green-600 hover:text-green-800 mr-2" title="Receber parcela">
                            💰 Receber
                        </button>
                    ` : ''}
                    ${p.status === 'pago' ? '✅' : ''}
                    ${p.status === 'cancelado' ? '🚫' : ''}
                    <button onclick="window.verDetalhesParcela('${p.pedidoId}')" class="text-blue-600 hover:text-blue-800" title="Ver pedido">
                        👁️
                    </button>
                </td>
            </tr>`;
        });
    }

    document.getElementById('tabela-financeiro').innerHTML = html;
};

window.verDetalhesParcela = function(pedidoId) {
    const pedido = window.bancoPedidos.find(p => p.id === pedidoId);
    if (pedido) {
        window.abrirPedidoParaEdicao(pedidoId);
    } else {
        Swal.fire({
            icon: 'error',
            title: 'Erro',
            text: 'Pedido não encontrado!',
            confirmButtonColor: '#3b82f6'
        });
    }
};

// ==========================================
// FUNÇÕES DE STATUS
// ==========================================

// Configuração centralizada de status
const STATUS_CONFIG = {
    'Orçamento':               { btnId: 'status-orcamento',  cor: 'border-yellow-500 bg-yellow-50 text-yellow-700', progresso: { width: '10%',  cor: 'bg-yellow-500', texto: 'Orçamento' } },
    'Produção':                { btnId: 'status-producao',   cor: 'border-blue-500 bg-blue-50 text-blue-700',       progresso: { width: '50%',  cor: 'bg-blue-500',   texto: 'Em produção' } },
    'Em Entrega':              { btnId: 'status-entrega',    cor: 'border-orange-500 bg-orange-50 text-orange-700', progresso: { width: '75%',  cor: 'bg-orange-500', texto: 'Saiu para entrega' } },
    'Entregue':                { btnId: 'status-entregue',   cor: 'border-green-500 bg-green-50 text-green-700',    progresso: { width: '100%', cor: 'bg-green-500',  texto: 'Entregue' } },
    'Pedido Cancelado':        { btnId: 'status-cancelado',  cor: 'border-red-500 bg-red-50 text-red-700',          progresso: { width: '100%', cor: 'bg-red-500',    texto: 'Pedido cancelado' } },
    'Orçamento Não Aprovado':  { btnId: 'status-reprovado',  cor: 'border-red-400 bg-red-50 text-red-600',          progresso: { width: '10%',  cor: 'bg-red-400',    texto: 'Orçamento não aprovado' } }
};

// Status que bloqueiam edição dos campos do pedido
const STATUS_BLOQUEADOS = ['Produção', 'Em Entrega', 'Entregue'];

// Status que encerram o pedido (não geram/mantêm parcelas)
const STATUS_ENCERRADOS = ['Pedido Cancelado', 'Orçamento Não Aprovado'];

// Transições permitidas de cada status
const FLUXO_PERMITIDO = {
    'Orçamento':              ['Produção', 'Pedido Cancelado', 'Orçamento Não Aprovado'],
    'Produção':               ['Em Entrega', 'Pedido Cancelado'],
    'Em Entrega':             ['Entregue', 'Pedido Cancelado'],
    'Entregue':               [],
    'Pedido Cancelado':       [],
    'Orçamento Não Aprovado': []
};

window.selecionarStatus = async function(novoStatus) {
    const selectStatus = document.getElementById('select-status');
    const statusAtual = selectStatus ? selectStatus.value : 'Orçamento';

    if (statusAtual === novoStatus) return;

    const transicoesPermitidas = FLUXO_PERMITIDO[statusAtual] || [];

    if (!transicoesPermitidas.includes(novoStatus)) {
        let mensagem = '';
        if (['Entregue', 'Pedido Cancelado', 'Orçamento Não Aprovado'].includes(statusAtual)) {
            mensagem = `❌ O status "${statusAtual}" é final e não pode ser alterado!`;
        } else {
            mensagem = `❌ Não é possível ir de "${statusAtual}" para "${novoStatus}" diretamente.`;
        }

        Swal.fire({
            icon: 'error',
            title: 'Transição inválida',
            text: mensagem,
            confirmButtonColor: '#3b82f6'
        });

        atualizarBotoesStatus(statusAtual);
        return;
    }

    // ── VERIFICAÇÃO DE LIMITE DE CRÉDITO ao entrar em Produção ──────────
    if (novoStatus === 'Produção') {
        const nomeCliente = document.getElementById('input-cliente')?.value || '';
        const clienteObj = window.bancoClientes.find(c => c.nome === nomeCliente);
        const limite = parseFloat(clienteObj?.limite) || 0;

        if (limite > 0) {
            const pedidoIdAtual = document.getElementById('pedido-id-atual')?.value || '';
            const totalAtual = parseFloat(
                document.getElementById('btn-gerar-pdf')?.getAttribute('data-total')?.replace(',', '.') || '0'
            ) || 0;

            // Soma pedidos ativos do cliente (exceto o atual)
            const ESTADOS_ATIVOS = ['Produção', 'Em Entrega'];
            const totalEmAberto = window.bancoPedidos
                .filter(p => p.cliente_id === clienteObj?.id && ESTADOS_ATIVOS.includes(p.status) && p.id !== pedidoIdAtual)
                .reduce((sum, p) => sum + (parseFloat(p.valor_total) || 0), 0);

            const totalComEste = totalEmAberto + totalAtual;

            if (totalComEste > limite) {
                const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const result = await Swal.fire({
                    icon: 'warning',
                    title: '⚠️ Limite de crédito excedido',
                    html: `
                        <div style="text-align:left;font-size:14px;line-height:1.8">
                            <b>Cliente:</b> ${clienteObj.nome}<br>
                            <b>Limite:</b> <span style="color:#16a34a">${fmt(limite)}</span><br>
                            <b>Em aberto:</b> <span style="color:#dc2626">${fmt(totalEmAberto)}</span><br>
                            <b>Este pedido:</b> <span style="color:#2563eb">${fmt(totalAtual)}</span><br>
                            <hr style="margin:8px 0">
                            <b>Total com este pedido:</b> <span style="color:#dc2626;font-weight:bold">${fmt(totalComEste)}</span><br>
                            <b>Limite disponível:</b> <span style="color:#dc2626;font-weight:bold">${fmt(Math.max(0, limite - totalEmAberto))}</span>
                        </div>`,
                    showCancelButton: true,
                    confirmButtonColor: '#dc2626',
                    cancelButtonColor: '#6b7280',
                    confirmButtonText: '⚠️ Produzir mesmo assim',
                    cancelButtonText: 'Cancelar'
                });

                if (!result.isConfirmed) {
                    atualizarBotoesStatus(statusAtual);
                    return;
                }
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────

    if (selectStatus) selectStatus.value = novoStatus;
    atualizarBotoesStatus(novoStatus);
    atualizarBarraProgresso(novoStatus);

    // Bloqueia campos apenas para status operacionais (não para cancelados)
    if (STATUS_BLOQUEADOS.includes(novoStatus)) {
        bloquearCampos(true);
        const aviso = document.getElementById('aviso-bloqueio');
        const spanStatus = document.getElementById('status-bloqueio');
        if (aviso && spanStatus) {
            spanStatus.innerText = novoStatus;
            aviso.classList.remove('hidden');
        }
    } else {
        bloquearCampos(false);
        const aviso = document.getElementById('aviso-bloqueio');
        if (aviso) aviso.classList.add('hidden');
    }

    const clienteSelect = document.getElementById('input-cliente');
    const cliente = clienteSelect ? clienteSelect.value : '';

    if (!cliente) {
        Swal.fire({
            icon: 'warning',
            title: 'Cliente não selecionado',
            text: 'Selecione um cliente antes de mudar o status!',
            confirmButtonColor: '#3b82f6'
        });
        return;
    }

    Swal.fire({
        title: 'Salvar pedido?',
        text: `Status alterado para "${novoStatus}". Deseja salvar o pedido agora?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sim, salvar',
        cancelButtonText: 'Não'
    }).then((result) => {
        if (result.isConfirmed) {
            salvarPedidoAtual();
        }
    });
};

function bloquearCampos(bloquear) {
    const campos = [
        'input-cliente', 'input-km', 'input-litro', 'input-consumo',
        'input-pedagio', 'input-desconto', 'input-acrescimo',
        'input-motivo-acrescimo', 'select-pagamento',
        'select-condicao-pagamento', 'input-parcelas',
        'input-primeiro-vencimento', 'input-previsao'
    ];

    campos.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            if (bloquear) {
                campo.setAttribute('disabled', 'disabled');
                campo.classList.add('bg-gray-100', 'cursor-not-allowed');
            } else {
                campo.removeAttribute('disabled');
                campo.classList.remove('bg-gray-100', 'cursor-not-allowed');
            }
        }
    });

    document.querySelectorAll('#tabela-itens input, #tabela-itens select').forEach(input => {
        if (bloquear) {
            input.setAttribute('disabled', 'disabled');
            input.classList.add('bg-gray-100', 'cursor-not-allowed');
        } else {
            input.removeAttribute('disabled');
            input.classList.remove('bg-gray-100', 'cursor-not-allowed');
        }
    });

    document.querySelectorAll('#tabela-itens button').forEach(btn => {
        if (bloquear) {
            btn.setAttribute('disabled', 'disabled');
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            btn.removeAttribute('disabled');
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });

    const btnAdicionar = document.querySelector('#linha-adicionar button');
    if (btnAdicionar) {
        if (bloquear) {
            btnAdicionar.setAttribute('disabled', 'disabled');
            btnAdicionar.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            btnAdicionar.removeAttribute('disabled');
            btnAdicionar.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    // Botão Salvar NUNCA é desabilitado pelo bloquearCampos
    // (o usuário precisa conseguir salvar mesmo com campos bloqueados)
    const btnSalvar = document.getElementById('btn-salvar');
    if (btnSalvar && !bloquear) {
        btnSalvar.removeAttribute('disabled');
        btnSalvar.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function atualizarBotoesStatus(status) {
    // Remove destaque de todos os botões
    Object.values(STATUS_CONFIG).forEach(cfg => {
        const btn = document.getElementById(cfg.btnId);
        if (!btn) return;
        // Remove todas as classes de cor possíveis
        btn.classList.remove(
            'border-yellow-500', 'bg-yellow-50', 'text-yellow-700',
            'border-blue-500', 'bg-blue-50', 'text-blue-700',
            'border-orange-500', 'bg-orange-50', 'text-orange-700',
            'border-green-500', 'bg-green-50', 'text-green-700',
            'border-red-500', 'bg-red-50', 'text-red-700',
            'border-red-400', 'text-red-600'
        );
        btn.classList.add('border-gray-200', 'bg-gray-50', 'text-gray-700');
    });

    // Destaca o botão do status atual
    const cfg = STATUS_CONFIG[status];
    if (cfg) {
        const btn = document.getElementById(cfg.btnId);
        if (btn) {
            btn.classList.remove('border-gray-200', 'bg-gray-50', 'text-gray-700');
            cfg.cor.split(' ').forEach(cls => btn.classList.add(cls));
        }
    }
}

function atualizarBarraProgresso(status) {
    const barra = document.getElementById('progress-bar');
    const label = document.getElementById('status-label');
    if (!barra || !label) return;

    const cfg = STATUS_CONFIG[status]?.progresso || STATUS_CONFIG['Orçamento'].progresso;

    barra.classList.remove('bg-yellow-500', 'bg-blue-500', 'bg-orange-500', 'bg-green-500', 'bg-red-500', 'bg-red-400');
    barra.classList.add(cfg.cor);
    barra.style.width = cfg.width;
    label.innerHTML = `Status: ${status} - ${cfg.texto}`;
}

function gerarBadgeStatus(status) {
    const config = {
        'Orçamento':              { cor: 'bg-yellow-100 text-yellow-800 border-yellow-300', icone: '📋' },
        'Produção':               { cor: 'bg-blue-100 text-blue-800 border-blue-300',       icone: '🔧' },
        'Em Entrega':             { cor: 'bg-orange-100 text-orange-800 border-orange-300', icone: '🚚' },
        'Entregue':               { cor: 'bg-green-100 text-green-800 border-green-300',    icone: '✅' },
        'Pedido Cancelado':       { cor: 'bg-red-100 text-red-800 border-red-300',          icone: '🚫' },
        'Orçamento Não Aprovado': { cor: 'bg-red-50 text-red-600 border-red-200',           icone: '📉' }
    };
    const cfg = config[status] || { cor: 'bg-gray-100 text-gray-800 border-gray-300', icone: '📦' };
    return `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${cfg.cor}">${cfg.icone} ${status}</span>`;
}

// ==========================================
// FUNÇÕES DO BANCO DE DADOS
// ==========================================
async function obterProximoNumeroPedido() {
    const ref = doc(db, "configuracoes", "contador_pedidos");
    return await runTransaction(db, async (t) => {
        const snap = await t.get(ref);
        const n = snap.exists() ? snap.data().ultimo_numero + 1 : 1;
        t.set(ref, { ultimo_numero: n });
        return n;
    });
}

async function carregarMemoriaBanco() {
    if (!auth.currentUser) {
        console.warn('⚠️ carregarMemoriaBanco ignorado: usuário não autenticado');
        return;
    }
    try {
        console.log('📥 Carregando clientes...');
        const cliSnap = await getDocs(collection(db, "clientes"));
        window.bancoClientes = cliSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        console.log('📥 Carregando produtos...');
        const prodSnap = await getDocs(collection(db, "produtos"));
        window.bancoProdutos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Migração silenciosa: clientes sem codigo recebem um agora
        const clientesSemCodigo = cliSnap.docs.filter(d => !d.data().codigo);
        if (clientesSemCodigo.length > 0) {
            let maxCodigo = 0;
            cliSnap.docs.forEach(d => {
                const num = parseInt(d.data().codigo);
                if (!isNaN(num) && num > maxCodigo) maxCodigo = num;
            });
            const batchMig = writeBatch(db);
            clientesSemCodigo.forEach(d => {
                maxCodigo++;
                batchMig.update(d.ref, { codigo: maxCodigo.toString().padStart(4, '0') });
            });
            await batchMig.commit();
            console.log(`✅ ${clientesSemCodigo.length} cliente(s) sem código receberam códigos sequenciais.`);
        }

        console.log('📥 Carregando pedidos...');
        const pedSnap = await getDocs(collection(db, "pedidos"));
        window.bancoPedidos = pedSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        console.log('📥 Carregando parcelas...');
        await carregarParcelasDoFirebase();

        window.bancoPedidos.sort((a, b) => (b.data_criacao?.seconds || 0) - (a.data_criacao?.seconds || 0));

        renderizarTudo();
    } catch (e) {
        console.error("Erro ao carregar:", e);
        Swal.fire({
            icon: 'error',
            title: 'Erro',
            text: 'Erro ao carregar dados do banco!',
            confirmButtonColor: '#3b82f6'
        });
    }
}

function renderizarTudo() {
    document.getElementById('tabela-pedidos').innerHTML = window.bancoPedidos.map(p => `
        <tr class="border-b text-sm hover:bg-gray-50">
            <td class="p-2 border-r font-bold">#${p.numero_sequencial?.toString().padStart(3, '0') || 'S/N'}</td>
            <td class="p-2 border-r">${p.data_criacao ? new Date(p.data_criacao.seconds * 1000).toLocaleDateString() : '-'}</td>
            <td class="p-2 border-r font-mono text-xs text-gray-500">${(window.bancoClientes.find(cl => cl.id === p.cliente_id)?.codigo) || '---'}</td>
            <td class="p-2 border-r">${window.bancoClientes.find(cl => cl.id === p.cliente_id)?.nome || p.cliente_nome}</td>
            <td class="p-2 border-r">${gerarBadgeStatus(p.status)}</td>
            <td class="p-2 border-r">${window.formatarValorReais(p.valor_total)}</td>
            <td class="p-2 border-r">${p.condicao_pagamento || 'Vista'}</td>
            <td class="p-2 text-center">
                <button onclick="window.abrirPedidoParaEdicao('${p.id}')" class="btn btn-dark btn-sm">
                    👁️ Abrir
                </button>
            </td>
        </tr>`).join('');

    document.getElementById('lista-clientes').innerHTML = window.bancoClientes.map(c => {
        const telefone = c.telefone || '-';
        const endereco = c.endereco || '-';
        const enderecoResumido = endereco.length > 30 ? endereco.substring(0, 30) + '...' : endereco;
        const limite = c.limite ? window.formatarValorReais(c.limite) : 'R$ 0,00';

        return `
        <tr class="border-b text-sm hover:bg-gray-50">
            <td class="p-2 border">${c.codigo || '---'}</td>
            <td class="p-2 border">${c.nome}</td>
            <td class="p-2 border">${telefone}</td>
            <td class="p-2 border">${enderecoResumido}</td>
            <td class="p-2 border">${limite}</td>
            <td class="p-2 border">
                <button onclick="window.editarCliente('${c.id}')" class="text-blue-600 hover:text-blue-800 mr-2">✏️</button>
                <button onclick="window.excluirCliente('${c.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" class="p-4 text-center text-gray-500">Nenhum cliente encontrado</td></tr>';

    document.getElementById('lista-produtos').innerHTML = window.bancoProdutos.map(p => {
        let estoqueClass = '';
        let estoqueText = '';

        if (p.estoque_atual !== undefined) {
            if (p.estoque_atual <= 0) {
                estoqueClass = 'text-red-600 font-bold';
                estoqueText = 'ESGOTADO';
            } else if (p.estoque_minimo && p.estoque_atual <= p.estoque_minimo) {
                estoqueClass = 'text-orange-600 font-bold';
                estoqueText = 'BAIXO';
            } else {
                estoqueClass = 'text-green-600';
                estoqueText = p.estoque_atual;
            }
        }

        return `
        <tr class="border-b text-sm hover:bg-gray-50">
            <td class="p-2 border font-mono font-bold">${p.codigo || '---'}</td>
            <td class="p-2 border">${p.descricao}</td>
            <td class="p-2 border">${p.categoria || '-'}</td>
            <td class="p-2 border">${p.marca || '-'}</td>
            <td class="p-2 border font-bold">${window.formatarValorReais(p.valor_base)}</td>
            <td class="p-2 border ${estoqueClass}">${estoqueText}</td>
            <td class="p-2 border">
                <button onclick="window.editarProduto('${p.id}')" class="text-blue-600 hover:text-blue-800 mr-2">✏️</button>
                <button onclick="window.excluirProduto('${p.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="p-4 text-center text-gray-500">Nenhum produto encontrado</td></tr>';

    const selectCliente = document.getElementById('input-cliente');
    if (selectCliente) {
        const currentValue = selectCliente.value;
        selectCliente.innerHTML = '<option value="">Selecione um cliente</option>';
        window.bancoClientes.forEach(c => {
            selectCliente.innerHTML += `<option value="${c.nome}">${c.codigo ? '[' + c.codigo + '] ' : ''}${c.nome}</option>`;
        });
        if (currentValue) selectCliente.value = currentValue;

        if ($.fn.select2) {
            $(selectCliente).select2({ placeholder: "Busque um cliente...", allowClear: true, width: '100%' });
        }
    }

    const tbody = document.getElementById('tabela-itens');
    if (tbody && tbody.children.length === 0) {
        window.novoPedido();
    } else {
        document.querySelectorAll('#tabela-itens .produto-select').forEach(select => {
            if ($.fn.select2) {
                $(select).select2({ placeholder: "Busque um produto...", allowClear: true, width: '100%' });
            }
        });
    }
}

function renderizarTabelaPedidosNoFilter(lista) {
    document.getElementById('tabela-pedidos').innerHTML = lista.map(p => `
        <tr class="border-b text-sm hover:bg-gray-50">
            <td class="p-2 border-r font-bold">#${p.numero_sequencial?.toString().padStart(3, '0') || 'S/N'}</td>
            <td class="p-2 border-r">${p.data_criacao ? new Date(p.data_criacao.seconds * 1000).toLocaleDateString() : '-'}</td>
            <td class="p-2 border-r font-mono text-xs text-gray-500">${(window.bancoClientes.find(cl => cl.id === p.cliente_id)?.codigo) || '---'}</td>
            <td class="p-2 border-r">${window.bancoClientes.find(cl => cl.id === p.cliente_id)?.nome || p.cliente_nome}</td>
            <td class="p-2 border-r">${gerarBadgeStatus(p.status)}</td>
            <td class="p-2 border-r">${window.formatarValorReais(p.valor_total)}</td>
            <td class="p-2 border-r">${p.condicao_pagamento || 'Vista'}</td>
            <td class="p-2 text-center">
                <button onclick="window.abrirPedidoParaEdicao('${p.id}')" class="btn btn-dark btn-sm">
                    👁️ Abrir
                </button>
            </td>
        </tr>`).join('');
}

// ==========================================
// FUNÇÃO PARA NOVO PEDIDO
// ==========================================
window.novoPedido = function() {
    console.log('➕ Novo pedido');

    bloquearCampos(false);
    document.getElementById('aviso-bloqueio').classList.add('hidden');
    document.getElementById('pedido-id-atual').value = '';

    const selectCliente = document.getElementById('input-cliente');
    if (selectCliente) {
        selectCliente.disabled = false;
        if ($.fn.select2) {
            $(selectCliente).next('.select2-container').css('pointer-events','').css('opacity','');
            $(selectCliente).val('').trigger('change');
        } else {
            selectCliente.value = '';
        }
    }

    document.getElementById('input-endereco').value = '';
    document.getElementById('dados-cliente-container').classList.add('hidden');
    document.getElementById('input-km').value = '';
    document.getElementById('input-litro').value = '4.20';
    document.getElementById('input-consumo').value = '9.0';
    document.getElementById('input-pedagio').value = '0,00';
    document.getElementById('input-desconto').value = '0';
    document.getElementById('input-acrescimo').value = '0,00';
    document.getElementById('input-motivo-acrescimo').value = '';
    document.getElementById('select-pagamento').value = 'Pix';
    document.getElementById('select-condicao-pagamento').value = 'Vista';
    document.getElementById('div-parcelas-personalizado').classList.add('hidden');
    document.getElementById('input-primeiro-vencimento').value = '';
    document.getElementById('input-previsao').value = '';
    document.getElementById('pdf-n-display').innerText = '';

    document.getElementById('custo-combustivel').innerText = 'R$ 0,00';
    document.getElementById('custo-pedagio').innerText = 'R$ 0,00';
    document.getElementById('custo-total-frete').innerText = 'R$ 0,00';
    document.getElementById('display-frete-estimado').value = 'R$ 0,00';
    document.getElementById('display-subtotal').innerText = 'Subtotal: R$ 0,00';
    document.getElementById('display-desconto').innerText = 'Desconto: - R$ 0,00';
    document.getElementById('display-acrescimo').innerText = 'Acréscimo: + R$ 0,00';
    document.getElementById('display-frete-final').innerText = 'Frete: R$ 0,00';
    document.getElementById('display-taxa-final').classList.add('hidden');
    document.getElementById('display-total').innerText = 'Total: R$ 0,00';
    document.getElementById('btn-gerar-pdf').setAttribute('data-total', '0,00');
    document.getElementById('btn-cancelar-pedido').classList.add('hidden');

    const btnSalvar = document.getElementById('btn-salvar');
    btnSalvar.innerHTML = '📦 Salvar Pedido';
    btnSalvar.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    btnSalvar.classList.add('bg-green-600', 'hover:bg-green-700');

    const selectStatus = document.getElementById('select-status');
    if (selectStatus) selectStatus.value = 'Orçamento';

    atualizarBotoesStatus('Orçamento');
    atualizarBarraProgresso('Orçamento');

    document.getElementById('tabela-itens').innerHTML = `
        <tr>
            <td colspan="7" class="p-4 text-center text-gray-500">
                Nenhum item adicionado. Clique em "Adicionar Itens" para começar.
            </td>
        </tr>
    `;

    window.calcularTudo();
};

// ==========================================
// FUNÇÃO PARA CANCELAR EDIÇÃO
// ==========================================
window.cancelarEdicao = async function() {
    const result = await Swal.fire({
        title: 'Cancelar edição?',
        text: 'Todas as alterações não salvas serão perdidas.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sim, cancelar',
        cancelButtonText: 'Não'
    });

    if (result.isConfirmed) {
        window.novoPedido();
    }
};

// ==========================================
// FUNÇÃO PARA SALVAR PEDIDO
// ==========================================
async function salvarPedidoAtual() {
    console.log('💾 Salvando pedido...');

    if (!auth.currentUser) {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Usuário não autenticado!', confirmButtonColor: '#3b82f6' });
        return;
    }

    const btn = document.getElementById('btn-salvar');
    if (!btn || btn.disabled) return; // evita duplo clique

    // Determina o texto correto baseado no modo, nunca captura estado travado
    const id = document.getElementById('pedido-id-atual')?.value;
    const textoOriginal = id ? '✏️ Atualizar Pedido' : '📦 Salvar Pedido';

    const selectCliente = document.getElementById('input-cliente');
    const nomeCliente = selectCliente ? selectCliente.value : '';
    const cliente = window.bancoClientes.find(c => c.nome === nomeCliente);

    if (!cliente) {
        Swal.fire({ icon: 'warning', title: 'Cliente inválido', text: 'Selecione um cliente válido!', confirmButtonColor: '#3b82f6' });
        return;
    }

    let pedagio = 0;
    const pedagioInput = document.getElementById('input-pedagio')?.value;
    if (pedagioInput) pedagio = parseFloat(pedagioInput.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

    let acrescimo = 0;
    const acrescimoInput = document.getElementById('input-acrescimo')?.value;
    if (acrescimoInput) acrescimo = parseFloat(acrescimoInput.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

    const condicaoPagamento = document.getElementById('select-condicao-pagamento')?.value || 'Vista';
    const primeiroVencimento = document.getElementById('input-primeiro-vencimento')?.value;
    const statusAtual = document.getElementById('select-status')?.value || 'Orçamento';

    const dados = {
        cliente_nome: nomeCliente,
        cliente_id: cliente.id,
        cliente_endereco: cliente.endereco || '',
        cliente_telefone: cliente.telefone || '',
        cliente_documento: cliente.documento || '',
        status: statusAtual,
        condicao_pagamento: condicaoPagamento,
        primeiro_vencimento: primeiroVencimento,
        valor_total: parseFloat(document.getElementById('btn-gerar-pdf')?.getAttribute('data-total')?.replace(',', '.') || '0') || 0,
        desconto: document.getElementById('input-desconto')?.value || '0',
        acrescimo: acrescimo,
        motivo_acrescimo: document.getElementById('input-motivo-acrescimo')?.value || '',
        frete: {
            distancia: document.getElementById('input-km')?.value || '0',
            preco_combustivel: document.getElementById('input-litro')?.value || '4.20',
            consumo: document.getElementById('input-consumo')?.value || '9.0',
            pedagio: pedagio,
            custo_combustivel: document.getElementById('custo-combustivel')?.innerText || 'R$ 0,00',
            custo_total: document.getElementById('custo-total-frete')?.innerText || 'R$ 0,00'
        },
        itens: []
    };

    document.querySelectorAll('#tabela-itens tr:not(#linha-adicionar)').forEach(tr => {
        const select = tr.querySelector('.desc-item');
        if (!select) return;
        const selectedOption = select.options[select.selectedIndex];
        if (!selectedOption || !selectedOption.value) return;

        // Busca o produto por id (mais confiável), depois pelo value do select (que é o id)
        const produtoId = tr.dataset.produtoId || selectedOption.value;
        const produto = window.bancoProdutos.find(p => p.id === produtoId);

        // Sem produto encontrado no banco = linha inválida, ignora
        if (!produto) return;

        // Valor unitário: lê o campo da linha (digitado ou preenchido automaticamente)
        const valorRaw = tr.querySelector('.valor-item')?.value || '0,00';
        const valorNumerico = parseFloat(valorRaw.replace('R$', '').trim().replace(/\./g, '').replace(',', '.')) || 0;

        dados.itens.push({
            produto_id:     produto.id,
            produto_codigo: produto.codigo || '',
            descricao:      produto.descricao,
            fornecedor:     produto.fornecedor || tr.querySelector('.forn-item')?.value || '',
            quantidade:     tr.querySelector('.qtd-item')?.value || '1',
            valor_unitario: valorNumerico   // salva como número, não string formatada
        });
    });

    if (dados.itens.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Sem itens', text: 'Adicione pelo menos um item ao pedido!', confirmButtonColor: '#3b82f6' });
        return;
    }

    btn.innerHTML = '💾 Salvando...';
    btn.disabled = true;

    try {
        let pedidoId = id;

        // Captura status anterior para detectar transições que afetam estoque
        let statusAnterior = null;
        if (id) {
            const pedidoExistente = window.bancoPedidos.find(p => p.id === id);
            statusAnterior = pedidoExistente?.status || null;
        }

        if (id) {
            await updateDoc(doc(db, "pedidos", id), dados);
        } else {
            dados.numero_sequencial = await obterProximoNumeroPedido();
            dados.data_criacao = serverTimestamp();
            const docRef = await addDoc(collection(db, "pedidos"), dados);
            pedidoId = docRef.id;
            document.getElementById('pedido-id-atual').value = docRef.id;
            document.getElementById('btn-cancelar-pedido').classList.remove('hidden');
            atualizarTextoBotaoSalvar('editando');
            // Atualiza o display do número imediatamente após criar
            document.getElementById('pdf-n-display').innerText = '#' + dados.numero_sequencial.toString().padStart(3, '0');
        }

        // ==========================================
        // LÓGICA DE PARCELAS POR STATUS
        // ==========================================
        const ESTADOS_COM_ESTOQUE_DESCONTADO = ['Produção', 'Em Entrega', 'Entregue'];
        const entrandoEmProducao = statusAtual === 'Produção' && statusAnterior !== 'Produção';
        const cancelandoComEstoqueDescontado = STATUS_ENCERRADOS.includes(statusAtual) &&
            ESTADOS_COM_ESTOQUE_DESCONTADO.includes(statusAnterior);

        if (statusAtual === 'Produção') {
            // Remove parcelas antigas deste pedido e gera novas
            const parcelasSnap = await getDocs(collection(db, "parcelas"));
            const batchDelete = writeBatch(db);
            let contador = 0;

            parcelasSnap.forEach(docSnap => {
                if (docSnap.data().pedidoId === pedidoId) {
                    batchDelete.delete(docSnap.ref);
                    contador++;
                }
            });

            if (contador > 0) await batchDelete.commit();

            await gerarParcelas(pedidoId, nomeCliente, dados.valor_total, condicaoPagamento, primeiroVencimento);

            // Desconta estoque ao entrar em Produção (apenas na primeira vez)
            if (entrandoEmProducao && dados.itens?.length > 0) {
                await descontarEstoque(dados.itens);
            }

            await Swal.fire({
                icon: 'success',
                title: 'Pedido em PRODUÇÃO!',
                text: 'Parcelas geradas e estoque atualizado.',
                timer: 2000,
                showConfirmButton: false
            });

        } else if (STATUS_ENCERRADOS.includes(statusAtual)) {
            // Cancela parcelas pendentes quando pedido é cancelado/reprovado
            await cancelarParcelasDoPedido(pedidoId);

            // Estorna estoque se o pedido já tinha descontado
            if (cancelandoComEstoqueDescontado && dados.itens?.length > 0) {
                await estornarEstoque(dados.itens);
                await Swal.fire({
                    icon: 'info',
                    title: `Pedido "${statusAtual}"`,
                    text: 'Parcelas canceladas e estoque estornado automaticamente.',
                    timer: 2500,
                    showConfirmButton: false
                });
            } else {
                await Swal.fire({
                    icon: 'info',
                    title: `Pedido "${statusAtual}"`,
                    text: 'As parcelas pendentes foram canceladas no financeiro.',
                    timer: 2500,
                    showConfirmButton: false
                });
            }
        }

        await Swal.fire({
            icon: 'success',
            title: 'Sucesso!',
            text: 'Pedido salvo com sucesso!',
            timer: 2000,
            showConfirmButton: false
        });

        await carregarMemoriaBanco();

    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        Swal.fire({
            icon: 'error',
            title: 'Erro',
            text: 'Erro ao salvar pedido: ' + error.message,
            confirmButtonColor: '#3b82f6'
        });
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

function atualizarTextoBotaoSalvar(modo) {
    const btn = document.getElementById('btn-salvar');
    if (modo === 'editando') {
        btn.innerHTML = '✏️ Atualizar Pedido';
        btn.classList.remove('bg-green-600', 'hover:bg-green-700');
        btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    } else {
        btn.innerHTML = '📦 Salvar Pedido';
        btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
    }
}

// ==========================================
// EVENT LISTENER DO BOTÃO SALVAR
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    const btnSalvar = document.getElementById('btn-salvar');
    if (btnSalvar) {
        // Remove qualquer onclick inline e adiciona listener limpo
        btnSalvar.removeAttribute('onclick');
        btnSalvar.addEventListener('click', salvarPedidoAtual);
        console.log('✅ Botão salvar configurado');
    }
});

// ==========================================
// FUNÇÕES DE CLIENTES
// ==========================================
document.getElementById('btn-salvar-cliente').addEventListener('click', async () => {
    const id = document.getElementById('cli-id').value;
    const nome = document.getElementById('cli-nome').value;

    if (!nome) {
        Swal.fire({ icon: 'warning', title: 'Campo obrigatório', text: 'O nome do cliente é obrigatório!', confirmButtonColor: '#3b82f6' });
        return;
    }

    const telefone = document.getElementById('cli-telefone').value;
    const documento = document.getElementById('cli-documento').value;
    const email = document.getElementById('cli-email')?.value || '';
    const nascimento = document.getElementById('cli-nascimento')?.value || '';
    const limiteTexto = document.getElementById('cli-limite')?.value || '0,00';
    const observacoes = document.getElementById('cli-obs')?.value || '';
    const limite = parseFloat(limiteTexto.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

    let codigo = '';
    if (!id) {
        // Novo cliente: gera próximo código sequencial
        let maxCodigo = 0;
        window.bancoClientes.forEach(c => {
            if (c.codigo) {
                const num = parseInt(c.codigo);
                if (!isNaN(num) && num > maxCodigo) maxCodigo = num;
            }
        });
        codigo = (maxCodigo + 1).toString().padStart(4, '0');
    } else {
        // Edição: preserva o código existente
        const clienteExistente = window.bancoClientes.find(c => c.id === id);
        codigo = clienteExistente?.codigo || '';
        // Se por algum motivo não tem código, gera agora
        if (!codigo) {
            let maxCodigo = 0;
            window.bancoClientes.forEach(c => {
                if (c.codigo) {
                    const num = parseInt(c.codigo);
                    if (!isNaN(num) && num > maxCodigo) maxCodigo = num;
                }
            });
            codigo = (maxCodigo + 1).toString().padStart(4, '0');
        }
    }

    const d = {
        codigo, nome, telefone, documento,
        cep: document.getElementById('cli-cep').value,
        endereco: document.getElementById('cli-endereco').value,
        email, nascimento, limite, observacoes
    };

    try {
        if (id) {
            const clienteExistente = window.bancoClientes.find(c => c.id === id);
            const nomeAntigo = clienteExistente?.nome || '';
            await updateDoc(doc(db, "clientes", id), d);

            // Se o nome mudou, propaga para pedidos e parcelas vinculados
            if (nomeAntigo && nomeAntigo !== nome) {
                const pedidosVinculados = window.bancoPedidos.filter(p => p.cliente_id === id);
                if (pedidosVinculados.length > 0) {
                    const batch = writeBatch(db);
                    pedidosVinculados.forEach(p => {
                        batch.update(doc(db, 'pedidos', p.id), { cliente_nome: nome });
                    });
                    await batch.commit();

                    // Propaga também para parcelas (busca por cliente_nome antigo)
                    const parcelasSnap = await getDocs(collection(db, 'parcelas'));
                    const batchParc = writeBatch(db);
                    let temParcelas = false;
                    parcelasSnap.forEach(docSnap => {
                        const dadosParcela = docSnap.data();
                        if (dadosParcela.clienteNome === nomeAntigo || dadosParcela.cliente === nomeAntigo) {
                            const atualizacao = { clienteNome: nome };
                            // Garante que clienteId e clienteCodigo estão preenchidos
                            if (!dadosParcela.clienteId && id) atualizacao.clienteId = id;
                            if (!dadosParcela.clienteCodigo && clienteExistente?.codigo) atualizacao.clienteCodigo = clienteExistente.codigo;
                            batchParc.update(docSnap.ref, atualizacao);
                            temParcelas = true;
                        }
                    });
                    if (temParcelas) await batchParc.commit();
                }
            }

            Swal.fire({ icon: 'success', title: 'Sucesso!', text: 'Cliente atualizado!', timer: 2000, showConfirmButton: false });
        } else {
            await addDoc(collection(db, "clientes"), { ...d, data_cadastro: serverTimestamp() });
            Swal.fire({ icon: 'success', title: 'Sucesso!', text: 'Cliente cadastrado!', timer: 2000, showConfirmButton: false });
        }
    } catch (error) {
        console.error('Erro ao salvar cliente:', error);
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Erro ao salvar cliente!', confirmButtonColor: '#3b82f6' });
    }

    window.liberarLock(); // libera o lock após salvar
    ['cli-id', 'cli-codigo', 'cli-nome', 'cli-telefone', 'cli-documento', 'cli-cep', 'cli-endereco', 'cli-email', 'cli-nascimento', 'cli-obs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('cli-limite').value = '0,00';
    document.getElementById('btn-cancelar-cliente').classList.add('hidden');

    carregarMemoriaBanco();
});

// ==========================================
// FUNÇÃO PRINCIPAL - ABRIR PEDIDO
// ==========================================
window.abrirPedidoParaEdicao = function(id) {
    const pedido = window.bancoPedidos.find(x => x.id === id);
    if (!pedido) {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Pedido não encontrado!', confirmButtonColor: '#3b82f6' });
        return;
    }

    const cliente = window.bancoClientes.find(c => c.id === pedido.cliente_id);

    bloquearCampos(false);
    document.getElementById('aviso-bloqueio').classList.add('hidden');
    document.getElementById('pedido-id-atual').value = pedido.id;

    // Garante que o botão salvar nunca abre travado em "Salvando..."
    const btnSalvar = document.getElementById('btn-salvar');
    if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '✏️ Atualizar Pedido';
        btnSalvar.classList.remove('bg-green-600', 'hover:bg-green-700', 'opacity-50', 'cursor-not-allowed');
        btnSalvar.classList.add('bg-blue-600', 'hover:bg-blue-700');
    }

    const selectCliente = document.getElementById('input-cliente');
    // Busca o nome atual do cliente pelo ID (não pelo nome salvo no pedido, que pode estar desatualizado)
    const nomeClienteAtual = cliente?.nome || pedido.cliente_nome || '';
    if (selectCliente && nomeClienteAtual) {
        if ($.fn.select2) {
            $(selectCliente).val(nomeClienteAtual).trigger('change');
        } else {
            selectCliente.value = nomeClienteAtual;
        }
        // Bloqueia troca de cliente em pedido existente
        selectCliente.disabled = true;
        if ($.fn.select2) $(selectCliente).next('.select2-container').css('pointer-events','none').css('opacity','0.6');
    }

    document.getElementById('pdf-n-display').innerText = '#' + (pedido.numero_sequencial?.toString().padStart(3, '0') || '???');

    if (cliente) {
        document.getElementById('cliente-telefone').innerText = cliente.telefone || '-';
        document.getElementById('cliente-documento').innerText = cliente.documento || '-';
        document.getElementById('cliente-endereco').innerText = cliente.endereco || '-';
        document.getElementById('cliente-cep').innerText = cliente.cep || '-';
        document.getElementById('dados-cliente-container').classList.remove('hidden');
        document.getElementById('input-endereco').value = cliente.endereco || '';
    }

    document.getElementById('btn-cancelar-pedido').classList.remove('hidden');
    atualizarTextoBotaoSalvar('editando');

    // Atualiza status visual usando o objeto centralizado
    if (pedido.status) {
        const selectStatus = document.getElementById('select-status');
        if (selectStatus) selectStatus.value = pedido.status;
        atualizarBotoesStatus(pedido.status);
        atualizarBarraProgresso(pedido.status);
    }

    // Bloqueia campos apenas para status operacionais bloqueados
    if (STATUS_BLOQUEADOS.includes(pedido.status)) {
        bloquearCampos(true);
        const aviso = document.getElementById('aviso-bloqueio');
        const spanStatus = document.getElementById('status-bloqueio');
        if (aviso && spanStatus) {
            spanStatus.innerText = pedido.status;
            aviso.classList.remove('hidden');
        }
    }

    if (pedido.frete) {
        document.getElementById('input-km').value = pedido.frete.distancia || '0';
        document.getElementById('input-litro').value = pedido.frete.preco_combustivel || '4.20';
        document.getElementById('input-consumo').value = pedido.frete.consumo || '9.0';
        document.getElementById('input-pedagio').value = (pedido.frete.pedagio || 0).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
        if (pedido.frete.custo_combustivel) document.getElementById('custo-combustivel').innerText = pedido.frete.custo_combustivel;
        if (pedido.frete.custo_total) document.getElementById('custo-total-frete').innerText = pedido.frete.custo_total;
    }

    if (pedido.desconto) document.getElementById('input-desconto').value = pedido.desconto;
    if (pedido.acrescimo) document.getElementById('input-acrescimo').value = pedido.acrescimo.toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
    if (pedido.motivo_acrescimo) document.getElementById('input-motivo-acrescimo').value = pedido.motivo_acrescimo;

    if (pedido.condicao_pagamento) {
        document.getElementById('select-condicao-pagamento').value = pedido.condicao_pagamento;
        if (pedido.condicao_pagamento === 'Personalizado') {
            document.getElementById('div-parcelas-personalizado').classList.remove('hidden');
        }
    }

    if (pedido.primeiro_vencimento) {
        document.getElementById('input-primeiro-vencimento').value = pedido.primeiro_vencimento;
    }

    const tbody = document.getElementById('tabela-itens');
    tbody.innerHTML = '';

    if (pedido.itens && pedido.itens.length > 0) {
        pedido.itens.forEach((item, index) => {
            let valorUnitario = 0;

            if (typeof item.valor_unitario === 'string') {
                valorUnitario = parseFloat(item.valor_unitario.replace('R$', '').trim().replace('.', '').replace(',', '.'));
            } else if (typeof item.valor_unitario === 'number') {
                valorUnitario = item.valor_unitario;
            }

            if (isNaN(valorUnitario)) valorUnitario = 0;

            // Prioridade de busca: 1º id, 2º código, 3º nome (fallback para pedidos antigos)
            let produtoEncontrado = null;
            if (item.produto_id) {
                produtoEncontrado = window.bancoProdutos.find(p => p.id === item.produto_id);
            }
            if (!produtoEncontrado && item.produto_codigo) {
                produtoEncontrado = window.bancoProdutos.find(p => p.codigo === item.produto_codigo);
            }
            if (!produtoEncontrado && item.descricao) {
                produtoEncontrado = window.bancoProdutos.find(p =>
                    p.descricao?.trim().toLowerCase() === item.descricao.trim().toLowerCase()
                );
            }

            const tr = document.createElement('tr');
            tr.className = 'text-sm';
            tr.dataset.produtoId = produtoEncontrado?.id || item.produto_id || '';
            const selectId = 'produto-select-' + Date.now() + '-' + index + '-' + Math.random().toString(36).substr(2, 5);

            let selectHtml = `<select id="${selectId}" class="w-full p-1 border rounded desc-item border-blue-300 focus:ring-2 focus:ring-blue-500 bg-gray-50 produto-select" style="width: 100%;" onchange="window.preencherProduto(this)">`;
            selectHtml += '<option value="">Selecione um produto</option>';

            window.bancoProdutos.forEach(p => {
                const selected = (produtoEncontrado && p.id === produtoEncontrado.id) ? 'selected' : '';
                selectHtml += `<option value="${p.id}" data-valor="${p.valor_base}" data-forn="${p.fornecedor || ''}" data-desc="${p.descricao}" ${selected}>${p.codigo ? '#' + p.codigo + ' - ' : ''}${p.descricao} - ${window.formatarValorReais(p.valor_base)}</option>`;
            });

            selectHtml += '</select>';

            tr.innerHTML = `
                <td class="p-2 border"><input type="number" value="${item.quantidade || 1}" class="w-16 p-1 border rounded qtd-item" onchange="window.calcularTudo()"></td>
                <td class="p-2 border">${selectHtml}</td>
                <td class="p-2 border"><input type="text" value="${item.fornecedor || ''}" class="w-full p-1 border rounded forn-item bg-gray-100" readonly></td>
                <td class="p-2 border"><input type="text" value="${window.formatarValorReais(valorUnitario)}" class="w-24 p-1 border rounded valor-item bg-gray-100 text-right" readonly></td>
                <td class="p-2 border total-linha">R$ 0,00</td>
                <td class="p-2 border text-center"><button onclick="if(window.podeEditarPedido()) { this.closest('tr').remove(); window.calcularTudo(); } else { Swal.fire({ icon: 'error', title: 'Ação bloqueada', text: '❌ Não é possível remover itens de um pedido em andamento!', confirmButtonColor: '#3b82f6' }); }" class="text-red-500 font-bold">X</button></td>
            `;

            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">Nenhum item adicionado.</td></tr>';
    }

    setTimeout(() => {
        document.querySelectorAll('.produto-select').forEach(select => {
            if ($.fn.select2) {
                $(select).select2({ placeholder: "Busque um produto...", allowClear: true, width: '100%' });
            }
        });
    }, 100);

    window.mostrarAba('aba-cadastro');
    setTimeout(() => window.calcularTudo(), 500);
};

// ==========================================
// FUNÇÕES DE EDIÇÃO E EXCLUSÃO
// ==========================================
window.editarCliente = async function(id) {
    // Verifica se outro usuário está editando este cliente
    const lock = await window.tentarAcquireLock('cliente', id);
    const clienteObj = window.bancoClientes.find(cl => cl.id === id);

    if (lock.bloqueado) {
        Swal.fire({
            icon: 'warning',
            title: '🔒 Registro em uso',
            html: `O cliente <strong>${clienteObj?.nome || id}</strong> está sendo editado por <strong>${lock.usuario}</strong> (${lock.tempo}).<br><br>Aguarde ou entre em contato com esse usuário.`,
            confirmButtonColor: '#3b82f6',
            confirmButtonText: 'Entendido'
        });
        return;
    }
    document.getElementById('cli-id').value = id;
    document.getElementById('cli-codigo').value = clienteObj?.codigo || '';
    document.getElementById('cli-nome').value = clienteObj?.nome || '';
    document.getElementById('cli-telefone').value = clienteObj?.telefone || '';
    document.getElementById('cli-documento').value = clienteObj?.documento || '';
    document.getElementById('cli-cep').value = clienteObj?.cep || '';
    document.getElementById('cli-endereco').value = clienteObj?.endereco || '';
    document.getElementById('cli-email').value = clienteObj?.email || '';
    document.getElementById('cli-nascimento').value = clienteObj?.nascimento || '';
    document.getElementById('cli-limite').value = clienteObj?.limite ? parseFloat(clienteObj.limite).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2}) : '0,00';
    document.getElementById('cli-obs').value = clienteObj?.observacoes || '';
    document.getElementById('btn-cancelar-cliente').classList.remove('hidden');
    window.mostrarAba('aba-clientes');
};

window.editarProduto = async function(id) {
    const produto = window.bancoProdutos.find(p => p.id === id);
    const nomeProd = produto?.descricao || 'este produto';

    const lock = await window.tentarAcquireLock('produto', id);
    if (lock.bloqueado) {
        Swal.fire({
            icon: 'warning',
            title: '🔒 Registro em uso',
            html: `O produto <strong>${nomeProd}</strong> está sendo editado por <strong>${lock.usuario}</strong> (${lock.tempo}).<br><br>Aguarde ou entre em contato com esse usuário.`,
            confirmButtonColor: '#3b82f6',
            confirmButtonText: 'Entendido'
        });
        return;
    }

    if (typeof window.abrirCadastroCompletoProduto === 'function') {
        window.abrirCadastroCompletoProduto(id);
    }
};

window.excluirCliente = async (id) => {
    // Bloqueia exclusão se cliente tiver pedidos vinculados
    const pedidosVinculados = window.bancoPedidos.filter(p => p.cliente_id === id);
    if (pedidosVinculados.length > 0) {
        const cliente = window.bancoClientes.find(c => c.id === id);
        Swal.fire({
            icon: 'error',
            title: 'Não é possível excluir',
            html: `O cliente <strong>${cliente?.nome || ''}</strong> possui <strong>${pedidosVinculados.length} pedido(s)</strong> vinculado(s) e não pode ser excluído.<br><br>Para remover este cliente, primeiro exclua ou transfira os pedidos dele.`,
            confirmButtonColor: '#3b82f6'
        });
        return;
    }

    const result = await Swal.fire({
        title: 'Excluir cliente?', icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sim, excluir', cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
        await deleteDoc(doc(db, "clientes", id));
        carregarMemoriaBanco();
        Swal.fire({ icon: 'success', title: 'Excluído!', timer: 2000, showConfirmButton: false });
    }
};

window.excluirProduto = async (id) => {
    const result = await Swal.fire({
        title: 'Excluir produto?', icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sim, excluir', cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
        await deleteDoc(doc(db, "produtos", id));
        carregarMemoriaBanco();
        Swal.fire({ icon: 'success', title: 'Excluído!', timer: 2000, showConfirmButton: false });
    }
};

window.filtrarPedidos = (t) => {
    const tl = t.toLowerCase().replace('#', '');
    const f = window.bancoPedidos.filter(p => {
        const cliente = window.bancoClientes.find(cl => cl.id === p.cliente_id);
        const nomeAtual = cliente?.nome || p.cliente_nome || '';
        const codCliente = cliente?.codigo || '';
        const numPedido = p.numero_sequencial?.toString().padStart(3, '0') || '';
        return nomeAtual.toLowerCase().includes(tl) ||
               codCliente.includes(tl) ||
               numPedido.includes(tl);
    });
    renderizarTabelaPedidosNoFilter(f);
};

window.filtrarClientes = function(termo) {
    const tl = termo.toLowerCase();
    const filtrados = window.bancoClientes.filter(c =>
        c.nome?.toLowerCase().includes(tl) ||
        (c.telefone && c.telefone.includes(termo)) ||
        (c.documento && c.documento.includes(termo)) ||
        (c.codigo && c.codigo.includes(termo))
    );

    document.getElementById('lista-clientes').innerHTML = filtrados.map(c => {
        const endereco = c.endereco || '-';
        const enderecoResumido = endereco.length > 30 ? endereco.substring(0, 30) + '...' : endereco;
        const limite = c.limite ? window.formatarValorReais(c.limite) : 'R$ 0,00';
        return `
        <tr class="border-b text-sm hover:bg-gray-50">
            <td class="p-2 border">${c.codigo || '---'}</td>
            <td class="p-2 border">${c.nome}</td>
            <td class="p-2 border">${c.telefone || '-'}</td>
            <td class="p-2 border">${enderecoResumido}</td>
            <td class="p-2 border">${limite}</td>
            <td class="p-2 border">
                <button onclick="window.editarCliente('${c.id}')" class="text-blue-600 hover:text-blue-800 mr-2">✏️</button>
                <button onclick="window.excluirCliente('${c.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" class="p-4 text-center text-gray-500">Nenhum cliente encontrado</td></tr>';
};

window.filtrarProdutos = function(termo) {
    const tl = termo.toLowerCase();
    const filtrados = window.bancoProdutos.filter(p =>
        p.descricao?.toLowerCase().includes(tl) ||
        (p.categoria && p.categoria.toLowerCase().includes(tl)) ||
        (p.marca && p.marca.toLowerCase().includes(tl)) ||
        (p.codigo && p.codigo.includes(termo)) ||
        (p.codigo_barras && p.codigo_barras.includes(termo))
    );

    document.getElementById('lista-produtos').innerHTML = filtrados.map(p => {
        let estoqueClass = '', estoqueText = '';
        if (p.estoque_atual !== undefined) {
            if (p.estoque_atual <= 0) { estoqueClass = 'text-red-600 font-bold'; estoqueText = 'ESGOTADO'; }
            else if (p.estoque_minimo && p.estoque_atual <= p.estoque_minimo) { estoqueClass = 'text-orange-600 font-bold'; estoqueText = 'BAIXO'; }
            else { estoqueClass = 'text-green-600'; estoqueText = p.estoque_atual; }
        }
        return `
        <tr class="border-b text-sm hover:bg-gray-50">
            <td class="p-2 border font-mono font-bold">${p.codigo || '---'}</td>
            <td class="p-2 border">${p.descricao}</td>
            <td class="p-2 border">${p.categoria || '-'}</td>
            <td class="p-2 border">${p.marca || '-'}</td>
            <td class="p-2 border font-bold">${window.formatarValorReais(p.valor_base)}</td>
            <td class="p-2 border ${estoqueClass}">${estoqueText}</td>
            <td class="p-2 border">
                <button onclick="window.editarProduto('${p.id}')" class="text-blue-600 hover:text-blue-800 mr-2">✏️</button>
                <button onclick="window.excluirProduto('${p.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="p-4 text-center text-gray-500">Nenhum produto encontrado</td></tr>';
};

window.cancelarEdicaoCliente = function() {
    window.liberarLock(); // libera o lock do cliente
    ['cli-id', 'cli-codigo', 'cli-nome', 'cli-telefone', 'cli-documento', 'cli-cep', 'cli-endereco', 'cli-email', 'cli-nascimento', 'cli-obs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('cli-limite').value = '0,00';
    document.getElementById('btn-cancelar-cliente').classList.add('hidden');
};

// ==========================================
// FUNÇÃO DE RESET COMPLETO
// ==========================================
window.resetCompletoSistema = async function() {
    const r1 = await Swal.fire({
        title: '⚠️ ATENÇÃO!',
        text: 'Isso vai APAGAR TODOS os dados do sistema!',
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sim, apagar tudo!', cancelButtonText: 'Cancelar'
    });
    if (!r1.isConfirmed) return;

    const { value: senha } = await Swal.fire({
        title: '🔐 Confirmação', input: 'text',
        inputLabel: 'Digite a palavra: RESETAR', inputPlaceholder: 'RESETAR',
        showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar',
        inputValidator: (v) => { if (v !== 'RESETAR') return 'Palavra incorreta!'; }
    });
    if (!senha) return;

    const r2 = await Swal.fire({
        title: '🚨 ÚLTIMA CHANCE!', text: 'Deseja realmente APAGAR TUDO?',
        icon: 'question', showCancelButton: true,
        confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sim, resetar!', cancelButtonText: 'Não'
    });
    if (!r2.isConfirmed) return;

    try {
        Swal.fire({ title: 'Resetando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        for (const col of ['pedidos', 'clientes', 'produtos', 'parcelas']) {
            const snap = await getDocs(collection(db, col));
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        const contadorRef = doc(db, "configuracoes", "contador_pedidos");
        await setDoc(contadorRef, { ultimo_numero: 0 });

        await Swal.fire({ icon: 'success', title: 'Sistema resetado!', timer: 2000, showConfirmButton: false });
        window.location.reload();

    } catch (error) {
        console.error('Erro no reset:', error);
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Erro ao resetar: ' + error.message, confirmButtonColor: '#3b82f6' });
    }
};

// ==========================================
// EXPORTAÇÃO RÁPIDA DE BACKUP (menu lateral)
// ==========================================
window.exportarBackupRapido = async function() {
    const r = await Swal.fire({
        title: '💾 Exportar Backup',
        text: 'Isso vai baixar um arquivo Excel com todos os dados do sistema.',
        icon: 'info', showCancelButton: true,
        confirmButtonColor: '#3b82f6', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Exportar', cancelButtonText: 'Cancelar'
    });
    if (!r.isConfirmed) return;

    Swal.fire({ title: 'Gerando backup...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (!window.XLSX) { Swal.close(); window.location.href = 'admin.html'; return; }

        const wb = window.XLSX.utils.book_new();
        const colsDef = [
            { key:'clientes', nome:'CLIENTES', campos:['_id','codigo','nome','telefone','documento','email','cep','endereco','nascimento','limite','observacoes'] },
            { key:'produtos',  nome:'PRODUTOS', campos:['_id','codigo','codigo_fornecedor','descricao','categoria','fornecedor','unidade','valor_base','custo','estoque_atual'] },
            { key:'pedidos',   nome:'PEDIDOS',  campos:['_id','numero_sequencial','status','cliente_id','cliente_nome','valor_total','condicao_pagamento','data_criacao'] },
            { key:'parcelas',  nome:'PARCELAS', campos:['_id','pedidoId','clienteNome','clienteId','clienteCodigo','valor','vencimento','status','numeroParcela','totalParcelas','dataCriacao','dataPagamento'] },
        ];
        const bancos = { clientes: window.bancoClientes, produtos: window.bancoProdutos, pedidos: window.bancoPedidos };

        // Busca parcelas
        const parcelasSnap = await getDocs(collection(db, 'parcelas'));
        bancos.parcelas = parcelasSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

        for (const col of colsDef) {
            const dados = bancos[col.key] || [];
            const rows  = dados.map(d => {
                const row = {};
                col.campos.forEach(f => {
                    let v = d[f];
                    if (v && typeof v === 'object' && v.seconds) v = new Date(v.seconds * 1000).toLocaleDateString('pt-BR');
                    else if (v && typeof v === 'object') v = JSON.stringify(v);
                    row[f] = v ?? '';
                });
                return row;
            });
            const ws = window.XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(col.campos.map(f => [f, '']))]);
            ws['!cols'] = col.campos.map(f => ({ wch: Math.max(f.length + 2, 14) }));
            window.XLSX.utils.book_append_sheet(wb, ws, col.nome);
        }

        const now = new Date();
        const stamp = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;
        window.XLSX.writeFile(wb, `MPLEAO_Backup_${stamp}.xlsx`);
        Swal.fire({ icon: 'success', title: 'Backup gerado!', timer: 2000, showConfirmButton: false });
    } catch(e) {
        console.error('Erro no backup:', e);
        // Fallback: redireciona para admin que tem XLSX carregado
        Swal.close();
        window.location.href = 'admin.html';
    }
};

// ==========================================
// EXPORTAÇÕES GLOBAIS
// ==========================================
window.carregarMemoriaBanco = carregarMemoriaBanco;
window.salvarPedidoAtual = salvarPedidoAtual;
