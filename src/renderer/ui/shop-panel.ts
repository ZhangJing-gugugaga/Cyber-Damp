/**
 * 杂货铺侧栏（ui 层，右侧抽屉 360px 滑入）：账簿页眉 / 三分区商品卡 / 购买五态
 * AC-21/22/23：购买即扣币生效；售卖库存蘑菇（AC-20）
 * AC-36：抽屉根 auto（模态表面）/ 卡片与标题 none / 购买与关闭按钮 auto
 */
import { getItem, ITEMS } from '../../world/shop-catalog';
import type { WorldRuntime } from '../app/world-runtime';
import { icon, renderIcons } from './icons';

const SECTION_TITLE: Record<string, string> = {
  rope: '绳索升级',
  clip: '夹子升级',
  appliance: '环境家电',
  consumable: '环境家电',
};

export interface ShopPanel {
  el: HTMLElement;
  open(): void;
  close(): void;
  toggle(): void;
  refresh(): void;
}

export function createShopPanel(mount: HTMLElement, runtime: WorldRuntime, hooks: {
  onSell(): void;
  onBuy(itemId: string): void;
  onBuyBox(qty: number): void;
}): ShopPanel {
  let boxQty = 1; // 吸湿盒 stepper（1..9，上限 9）
  const el = document.createElement('aside');
  el.className = 'shop-drawer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '回南天杂货铺');
  el.style.display = 'none';

  const header = document.createElement('header');
  header.className = 'shop-drawer__header';
  el.appendChild(header);

  const body = document.createElement('div');
  body.className = 'shop-drawer__body';
  el.appendChild(body);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'shop-drawer__close';
  closeBtn.setAttribute('aria-label', '关闭杂货铺');
  closeBtn.innerHTML = icon('x', 20);
  closeBtn.addEventListener('click', () => close());
  header.appendChild(closeBtn);

  const title = document.createElement('h2');
  title.className = 'shop-drawer__title';
  title.textContent = '回南天杂货铺';
  header.appendChild(title);

  const sellBtn = document.createElement('button');
  sellBtn.type = 'button';
  sellBtn.className = 'sell-btn buy-btn';
  sellBtn.addEventListener('click', () => hooks.onSell());
  header.appendChild(sellBtn);

  function cardHtml(): void {
    const groups = ['rope', 'clip', 'appliance', 'consumable'];
    body.innerHTML = '';
    let lastSection = '';
    for (const g of groups) {
      const items = ITEMS.filter((i) => i.category === g);
      if (items.length === 0) continue;
      const sectionTitle = SECTION_TITLE[g];
      if (sectionTitle !== lastSection) {
        const h3 = document.createElement('h3');
        h3.className = 'shop-drawer__section-title';
        h3.textContent = sectionTitle;
        body.appendChild(h3);
        lastSection = sectionTitle;
      }
      for (const item of items) {
        const card = document.createElement('article');
        card.className = 'shop-card';

        // 吸湿盒：qty-stepper（1..9）+ 批量购买（P1）
        if (item.id === 'box-1') {
          card.classList.add('shop-card--box');
          const info = document.createElement('div');
          info.className = 'shop-card__info';
          const name = document.createElement('span');
          name.className = 'shop-card__name';
          name.textContent = item.name;
          const desc = document.createElement('span');
          desc.className = 'shop-card__desc';
          desc.textContent = item.desc;
          info.append(name, desc);
          card.appendChild(info);

          const stepper = document.createElement('div');
          stepper.className = 'qty-stepper';
          const minus = document.createElement('button');
          minus.type = 'button';
          minus.textContent = '−';
          minus.setAttribute('aria-label', '减少数量');
          const qty = document.createElement('span');
          qty.className = 'qty-stepper__value';
          qty.textContent = String(boxQty);
          const plus = document.createElement('button');
          plus.type = 'button';
          plus.textContent = '＋';
          plus.setAttribute('aria-label', '增加数量');
          minus.addEventListener('click', () => {
            boxQty = Math.max(1, boxQty - 1);
            qty.textContent = String(boxQty);
            buy.textContent = `购 ${boxQty} 盒（${item.price * boxQty} 币）`;
          });
          plus.addEventListener('click', () => {
            boxQty = Math.min(9, boxQty + 1);
            qty.textContent = String(boxQty);
            buy.textContent = `购 ${boxQty} 盒（${item.price * boxQty} 币）`;
          });
          stepper.append(minus, qty, plus);
          card.appendChild(stepper);

          const buy = document.createElement('button');
          buy.type = 'button';
          buy.className = 'buy-btn';
          if (runtime.coins < item.price) {
            buy.textContent = `还差 ${item.price - runtime.coins} 币`;
            buy.disabled = true;
          } else {
            buy.textContent = `购 ${boxQty} 盒（${item.price * boxQty} 币）`;
            buy.classList.add('buy-btn--primary');
            buy.addEventListener('click', () => hooks.onBuyBox(boxQty));
          }
          card.appendChild(buy);
          body.appendChild(card);
          continue;
        }

        const owned = runtime.owned.includes(item.id) && item.category !== 'consumable';
        const equipped = owned && (item.category === 'rope' ? runtime.equipped.rope === item.id : runtime.equipped.clip === item.id);
        const afford = runtime.coins >= item.price;

        const info = document.createElement('div');
        info.className = 'shop-card__info';
        const name = document.createElement('span');
        name.className = 'shop-card__name';
        name.textContent = item.name;
        const desc = document.createElement('span');
        desc.className = 'shop-card__desc';
        desc.textContent = item.desc;
        info.append(name, desc);
        card.appendChild(info);

        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'buy-btn';
        if (equipped) {
          buy.textContent = '装备中';
          buy.classList.add('buy-btn--equipped');
          buy.disabled = true;
        } else if (owned) {
          buy.textContent = '已拥有';
          buy.classList.add('buy-btn--owned');
          buy.disabled = true;
        } else if (!afford) {
          buy.textContent = `还差 ${item.price - runtime.coins} 币`;
          buy.disabled = true;
        } else {
          buy.textContent = item.price === 0 ? '领取' : `购买 ${item.price}`;
          buy.classList.add('buy-btn--primary');
          const id = item.id;
          buy.addEventListener('click', () => hooks.onBuy(id));
        }
        card.appendChild(buy);
        body.appendChild(card);
      }
    }
    const empty = document.createElement('p');
    empty.className = 'shop-drawer__meta';
    empty.textContent = '喷雾是消耗品，用完再来——货架不管够，回南天管饱。';
    body.appendChild(empty);
  }

  function refresh(): void {
    const mature = runtime.inventory.filter((i) => i.growth >= 1).length;
    sellBtn.textContent = mature > 0 ? `售卖成熟蘑菇 ${mature} 朵` : '库存无成熟蘑菇';
    sellBtn.disabled = mature === 0;
    cardHtml();
    renderIcons();
  }

  function open(): void {
    refresh();
    el.style.display = '';
  }
  function close(): void {
    el.style.display = 'none';
  }
  function toggle(): void {
    el.style.display === 'none' ? open() : close();
  }

  refresh();
  mount.appendChild(el);
  return { el, open, close, toggle, refresh };
}

/** 商品名查询（demo 控制台读数用） */
export function itemName(id: string): string {
  return getItem(id)?.name ?? id;
}
