/*
 * Spazio · Tienda Nube · botón de la gift card
 *
 * En el producto "Gift card Spazio" la plantilla muestra "Consultar precio"
 * (el producto no tiene precio a propósito: se cobra por transferencia).
 * Este script cambia ese botón por "Comprar gift card", con el mismo estilo,
 * y lo hace abrir la página de compra de la app de gestión.
 *
 * Se sube como archivo en partners.tiendanube.com → la app → Scripts
 * (ubicación: tienda, instalación automática). No toca ningún otro producto.
 */
(function () {
  var PRODUCTO_ID = '376672545';
  var DESTINO = 'https://spazio-gestion.vercel.app/gift-card';
  var TEXTO = 'Comprar gift card';

  function reemplazar(raiz) {
    var forms = (raiz || document).querySelectorAll('form[data-store="product-form-' + PRODUCTO_ID + '"]');
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      if (form.getAttribute('data-spazio-gc') === '1') continue;
      var boton = form.querySelector('.js-addtocart, input[type="submit"], button[type="submit"]');
      if (!boton) continue;
      var link = document.createElement('a');
      link.href = DESTINO;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = TEXTO;
      // Mismo aspecto que el botón original, sin las clases que disparan el carrito.
      link.className = (boton.className || '')
        .split(/\s+/)
        .filter(function (c) {
          return c && c.indexOf('js-') !== 0 && c !== 'contact';
        })
        .join(' ');
      link.style.textAlign = 'center';
      link.style.display = 'block';
      link.style.textDecoration = 'none';
      boton.parentNode.replaceChild(link, boton);
      // Por las dudas: el formulario de este producto no se envía nunca.
      form.addEventListener(
        'submit',
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          window.open(DESTINO, '_blank', 'noopener');
        },
        true
      );
      form.setAttribute('data-spazio-gc', '1');
    }
  }

  function iniciar() {
    reemplazar(document);
    // Vista rápida o contenido que la plantilla carga después.
    if (window.MutationObserver) {
      new MutationObserver(function () {
        reemplazar(document);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
