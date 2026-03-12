// ==========================================
// firebase.js - Configuração e funções do Firebase
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, doc, updateDoc, deleteDoc, runTransaction, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace('login.html');
    } else {
        localStorage.setItem('userLogged', 'true');
        if (!loginVerificado) {
            loginVerificado = true;
            carregarMemoriaBanco();
        }
    }
});

window.fazerLogout = function() {
    signOut(auth).then(() => window.location.replace('login.html'));
};

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

    const valorParcela = valorTotal / numeroParcelas;
    let dataVencimento = primeiroVencimento ? new Date(primeiroVencimento + 'T12:00:00') : new Date();

    for (let i = 0; i < numeroParcelas; i++) {
        const vencimento = new Date(dataVencimento);
        vencimento.setMonth(vencimento.getMonth() + i);

        const parcela = {
            pedidoId: pedidoId,
            cliente: clienteNome,
            numeroParcela: i + 1,
            totalParcelas: numeroParcelas,
            vencimento: vencimento.toISOString().split('T')[0],
            valor: valorParcela,
            status: 'pendente',
            dataPagamento: null,
            dataCriacao: new Date().toISOString()
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

        if (clienteFiltro !== 'todos' && p.cliente !== clienteFiltro) return false;

        if (busca) {
            const clienteMatch = p.cliente?.toLowerCase().includes(busca);
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
                <td class="p-2 border">${p.cliente}</td>
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

window.selecionarStatus = function(novoStatus) {
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

    const btnSalvar = document.getElementById('btn-salvar');
    if (btnSalvar) {
        if (bloquear) {
            btnSalvar.setAttribute('disabled', 'disabled');
            btnSalvar.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            btnSalvar.removeAttribute('disabled');
            btnSalvar.classList.remove('opacity-50', 'cursor-not-allowed');
        }
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
    try {
        console.log('📥 Carregando clientes...');
        const cliSnap = await getDocs(collection(db, "clientes"));
        window.bancoClientes = cliSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        console.log('📥 Carregando produtos...');
        const prodSnap = await getDocs(collection(db, "produtos"));
        window.bancoProdutos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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
            <td class="p-2 border-r">${p.cliente_nome}</td>
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
                <button onclick="window.editarCliente('${c.id}','${c.nome}','${c.telefone || ''}','${c.documento || ''}','${c.endereco || ''}','${c.cep || ''}','${c.email || ''}','${c.nascimento || ''}','${c.limite || 0}','${c.observacoes || ''}')" class="text-blue-600 hover:text-blue-800 mr-2">✏️</button>
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
            <td class="p-2 border-r">${p.cliente_nome}</td>
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
        if ($.fn.select2) {
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
    if (!btn) return;

    const textoOriginal = btn.innerHTML;
    const id = document.getElementById('pedido-id-atual')?.value;

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
        }

        // ==========================================
        // LÓGICA DE PARCELAS POR STATUS
        // ==========================================
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

            await Swal.fire({
                icon: 'success',
                title: 'Pedido em PRODUÇÃO!',
                text: 'Parcelas geradas no financeiro.',
                timer: 2000,
                showConfirmButton: false
            });

        } else if (STATUS_ENCERRADOS.includes(statusAtual)) {
            // Cancela parcelas pendentes quando pedido é cancelado/reprovado
            await cancelarParcelasDoPedido(pedidoId);

            await Swal.fire({
                icon: 'info',
                title: `Pedido "${statusAtual}"`,
                text: 'As parcelas pendentes foram canceladas no financeiro.',
                timer: 2500,
                showConfirmButton: false
            });
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
        const newBtn = btnSalvar.cloneNode(true);
        btnSalvar.parentNode.replaceChild(newBtn, btnSalvar);
        newBtn.addEventListener('click', salvarPedidoAtual);
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
        let maxCodigo = 0;
        window.bancoClientes.forEach(c => {
            if (c.codigo) {
                const num = parseInt(c.codigo);
                if (!isNaN(num) && num > maxCodigo) maxCodigo = num;
            }
        });
        codigo = (maxCodigo + 1).toString().padStart(4, '0');
    }

    const d = {
        codigo, nome, telefone, documento,
        cep: document.getElementById('cli-cep').value,
        endereco: document.getElementById('cli-endereco').value,
        email, nascimento, limite, observacoes
    };

    try {
        if (id) {
            await updateDoc(doc(db, "clientes", id), d);
            Swal.fire({ icon: 'success', title: 'Sucesso!', text: 'Cliente atualizado!', timer: 2000, showConfirmButton: false });
        } else {
            await addDoc(collection(db, "clientes"), { ...d, data_cadastro: serverTimestamp() });
            Swal.fire({ icon: 'success', title: 'Sucesso!', text: 'Cliente cadastrado!', timer: 2000, showConfirmButton: false });
        }
    } catch (error) {
        console.error('Erro ao salvar cliente:', error);
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Erro ao salvar cliente!', confirmButtonColor: '#3b82f6' });
    }

    ['cli-id', 'cli-nome', 'cli-telefone', 'cli-documento', 'cli-cep', 'cli-endereco', 'cli-email', 'cli-nascimento', 'cli-obs'].forEach(id => {
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

    const selectCliente = document.getElementById('input-cliente');
    if (selectCliente && pedido.cliente_nome) {
        if ($.fn.select2) {
            $(selectCliente).val(pedido.cliente_nome).trigger('change');
        } else {
            selectCliente.value = pedido.cliente_nome;
        }
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
        document.getElementById('input-pedagio').value = (pedido.frete.pedagio || 0).toFixed(2).replace('.', ',');
        if (pedido.frete.custo_combustivel) document.getElementById('custo-combustivel').innerText = pedido.frete.custo_combustivel;
        if (pedido.frete.custo_total) document.getElementById('custo-total-frete').innerText = pedido.frete.custo_total;
    }

    if (pedido.desconto) document.getElementById('input-desconto').value = pedido.desconto;
    if (pedido.acrescimo) document.getElementById('input-acrescimo').value = pedido.acrescimo.toFixed(2).replace('.', ',');
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
window.editarCliente = function(id, nome, telefone, documento, endereco, cep, email, nascimento, limite, observacoes) {
    document.getElementById('cli-id').value = id;
    document.getElementById('cli-nome').value = nome;
    document.getElementById('cli-telefone').value = telefone || '';
    document.getElementById('cli-documento').value = documento || '';
    document.getElementById('cli-cep').value = cep || '';
    document.getElementById('cli-endereco').value = endereco || '';
    document.getElementById('cli-email').value = email || '';
    document.getElementById('cli-nascimento').value = nascimento || '';
    document.getElementById('cli-limite').value = limite ? parseFloat(limite).toFixed(2).replace('.', ',') : '0,00';
    document.getElementById('cli-obs').value = observacoes || '';
    document.getElementById('btn-cancelar-cliente').classList.remove('hidden');
    window.mostrarAba('aba-clientes');
};

window.editarProduto = function(id) {
    if (typeof window.abrirCadastroCompletoProduto === 'function') {
        window.abrirCadastroCompletoProduto(id);
    }
};

window.excluirCliente = async (id) => {
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
    const f = window.bancoPedidos.filter(p => p.cliente_nome?.toLowerCase().includes(t.toLowerCase()));
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
                <button onclick="window.editarCliente('${c.id}','${c.nome}','${c.telefone || ''}','${c.documento || ''}','${c.endereco || ''}','${c.cep || ''}','${c.email || ''}','${c.nascimento || ''}','${c.limite || 0}','${c.observacoes || ''}')" class="text-blue-600 hover:text-blue-800 mr-2">✏️</button>
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
    ['cli-id', 'cli-nome', 'cli-telefone', 'cli-documento', 'cli-cep', 'cli-endereco', 'cli-email', 'cli-nascimento', 'cli-obs'].forEach(id => {
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
// EXPORTAÇÕES GLOBAIS
// ==========================================
window.carregarMemoriaBanco = carregarMemoriaBanco;
window.salvarPedidoAtual = salvarPedidoAtual;
