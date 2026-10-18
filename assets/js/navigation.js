document.addEventListener('DOMContentLoaded', () => {
    const menu = document.querySelector('.mobile-nav');
    const toggle = menu?.querySelector('.mobile-nav-toggle');
    const navigation = menu?.querySelector('nav');

    if (menu && toggle && navigation) {
        const closeMenu = () => {
            menu.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        };

        toggle.addEventListener('click', () => {
            const isOpen = menu.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });

        navigation.addEventListener('click', (event) => {
            if (event.target.closest('a')) closeMenu();
        });

        document.addEventListener('click', (event) => {
            if (!menu.contains(event.target)) closeMenu();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && menu.classList.contains('is-open')) {
                closeMenu();
                toggle.focus();
            }
        });
    }

});
