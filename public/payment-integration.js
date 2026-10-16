/* Guest checkout: the server owns prices, orders and payment confirmation. */
(() => {
  const api = async (endpoint, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.error || 'Não foi possível continuar. Tente novamente.');
        error.code = result.code;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('A resposta demorou mais que o esperado. Aguarde e tente novamente; seu pedido será recuperado.');
      throw error;
    } finally { clearTimeout(timeout); }
  };
  const pendingKey = 'cvt-pending-checkout';
  const adapter = {
    supportsPurchase: false,
    quote: payload => api('/api/checkout/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    async submit(payload) {
      await initialized;
      const signature = JSON.stringify(payload);
      let pending;
      try { pending = JSON.parse(sessionStorage.getItem(pendingKey)); } catch { /* A new operation needs a fresh key. */ }
      if (!pending || pending.signature !== signature) {
        pending = { key: crypto.randomUUID(), signature };
        // Persist before the request so a timeout/reload reuses the same operation.
        sessionStorage.setItem(pendingKey, JSON.stringify(pending));
      }
      try {
        const result = await api('/api/checkout', { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
          body: JSON.stringify({ ...payload, consent: true }),
        });
        pending.orderId = result.orderId;
        sessionStorage.setItem(pendingKey, JSON.stringify(pending));
        return result;
      } catch (error) {
        // The backend has confirmed this preference expired, so a new attempt is safe.
        if (error.code === 'checkout_expired') sessionStorage.removeItem(pendingKey);
        throw error;
      }
    },
  };
  window.CVT_CHECKOUT = adapter;
  window.CVT_ARTWORK = {
    async upload({ file, side }) {
      await initialized;
      if (!(file instanceof File) || !['front', 'back'].includes(side)) throw new Error('Selecione a arte para enviar.');
      if (file.size > 15 * 1024 * 1024) throw new Error('Envie um arquivo de até 15 MB.');
      return api(`/api/artworks?side=${side}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    },
  };
  const initialized = api('/api/checkout/status').then(status => {
    adapter.supportsPurchase = status.ready === true;
    window.dispatchEvent(new Event('cvt-checkout-ready'));
  }).catch(() => window.dispatchEvent(new Event('cvt-checkout-ready')));

  async function checkReturn() {
    const id = new URL(location.href).searchParams.get('order');
    const output = document.querySelector('#paymentReturnStatus');
    if (!id || !output || !/^[a-f0-9-]{36}$/i.test(id)) return;
    output.hidden = false;
    const messages = {
      creating: 'Seu pedido foi registrado. A abertura do pagamento está sendo conferida.',
      setup_unknown: 'Estamos conferindo a abertura do pagamento. Aguarde antes de tentar novamente.',
      setup_failed: 'Não foi possível abrir o pagamento. Seu carrinho foi mantido.',
      pending: 'Seu pedido está aguardando a confirmação do pagamento. Seu carrinho foi mantido.',
      paid: 'Pagamento confirmado. Seu pedido foi recebido pela loja.',
      rejected: 'O pagamento não foi aprovado. Seu carrinho foi mantido.',
      refunded: 'O pagamento foi reembolsado.', partially_refunded: 'O pagamento recebeu um reembolso parcial.',
      charged_back: 'O pagamento está em contestação. Entre em contato com a loja.',
      payment_review: 'O pagamento está em conferência. Entre em contato com a loja.',
    };
    // Polling reads only our session-bound order. Provider return parameters never confirm payment.
    for (let attempt = 0; attempt < 12; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        const order = await api(`/api/orders/${encodeURIComponent(id)}`);
        output.textContent = `${messages[order.status] || 'O status do pedido está sendo conferido.'} Pedido: ${order.orderId}.`;
        if (order.status === 'paid') {
          let pending;
          try { pending = JSON.parse(sessionStorage.getItem(pendingKey)); } catch { /* Status still remains visible. */ }
          // Only remove the purchased snapshot; new/edited cart items remain in the cart.
          if (pending?.orderId === id && pending.signature && window.CVT_STORE) {
            const purchased = JSON.parse(pending.signature).items || [];
            const current = window.CVT_STORE.readCart();
            const remaining = current.filter(item => !purchased.some(old => old.lineId === item.lineId && old.quantity === item.quantity
              && JSON.stringify(old.configuration) === JSON.stringify(item.configuration)));
            window.CVT_STORE.writeCart(remaining);
            sessionStorage.removeItem(pendingKey);
            window.dispatchEvent(new Event('cvt-order-paid'));
          }
          return;
        }
        if (!['pending', 'creating', 'setup_unknown'].includes(order.status)) return;
      } catch (error) { output.textContent = error.message; return; }
    }
    output.textContent += ' A confirmação ainda não chegou. Você pode recarregar esta página mais tarde.';
  }
  document.addEventListener('DOMContentLoaded', checkReturn, { once: true });
})();
