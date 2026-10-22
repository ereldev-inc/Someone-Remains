/** Menu système (Échap) : sauvegarde en texte, importer, réinitialiser. Le jeu est en pause tant qu'il est ouvert. */
export class Menu {
  private readonly root = document.getElementById('menu') as HTMLElement;
  private readonly area = document.getElementById('menuText') as HTMLTextAreaElement;
  private readonly message = document.getElementById('menuMessage') as HTMLElement;
  visible = false;

  constructor(
    private readonly exportText: () => string | null,
    private readonly importText: (text: string) => boolean,
    private readonly reset: () => void,
    private readonly onVisibility: (visible: boolean) => void,
  ) {
    const click = (id: string, fn: () => void): void => document.getElementById(id)?.addEventListener('click', fn);
    click('menuClose', () => this.close());
    click('menuExport', () => {
      const text = this.exportText();
      this.area.value = text ?? '';
      this.message.textContent = text === null ? 'Aucune sauvegarde à exporter pour le moment.' : 'Copiez ce texte pour le conserver ou le coller sur un autre appareil.';
      this.area.select();
    });
    click('menuImport', () => {
      const ok = this.importText(this.area.value);
      this.message.textContent = ok ? 'Sauvegarde importée, rechargement…' : 'Texte de sauvegarde invalide.';
    });
    click('menuReset', () => {
      if (window.confirm('Effacer la sauvegarde (héritage, stockage, plans, compteur) ?')) this.reset();
    });
  }

  open(): void {
    this.visible = true;
    this.root.style.display = 'block';
    this.message.textContent = '';
    this.onVisibility(true);
  }

  close(): void {
    this.visible = false;
    this.root.style.display = 'none';
    this.onVisibility(false);
  }

  toggle(): void {
    this.visible ? this.close() : this.open();
  }
}
