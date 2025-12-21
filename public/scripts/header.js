class Header extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.innerHTML = `
        <header class="header">
            <img src="/assets/ilysa-logo.png"/>
        </header>`;
  }
}

customElements.define("header-component", Header);
