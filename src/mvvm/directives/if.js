import Parser, { linkParser } from '../parser';
import { hasOwn, nodeToFragment } from '../../util';
import { isElement, hasAttr, empty } from '../../dom';

/**
 * 移除 DOM 注册的引用
 * @param  {Object}      vm
 * @param  {DOMElement}  element
 */
function removeDOMRegister (vm, element) {
	let registers = vm.$regElements;
	let childNodes = element.childNodes;

	for (let i = 0; i < childNodes.length; i++) {
		let node = childNodes[i];

		if (!isElement(node)) {
			continue;
		}

		let nodeAttrs = node.attributes;

		for (let ii = 0; ii < nodeAttrs.length; ii++) {
			let attr = nodeAttrs[ii];

			if (
				attr.name === 'v-el' &&
				hasOwn(registers, attr.value)
			) {
				registers[attr.value] = null;
			}
		}

		if (node.hasChildNodes()) {
			removeDOMRegister(vm, node);
		}
	}
}


/**
 * v-if 指令解析模块
 */
export function VIf () {
	Parser.apply(this, arguments);
}

let vif = linkParser(VIf);

/**
 * 解析 v-if 指令
 */
vif.parse = function () {
	let el = this.el;
	let elseEl = el.nextElementSibling;

	// 缓存渲染内容
	this.elFrag = nodeToFragment(el);

	// else 节点
	if (elseEl && hasAttr(elseEl, 'v-else')) {
		this.elseEl = elseEl;
		this.elseElFrag = nodeToFragment(elseEl);
	}

	this.bind();
}

/**
 * 更新视图
 * @param  {Boolean}  isRender
 */
vif.update = function (isRender) {
	let elseEl = this.elseEl;

	this.toggle(this.el, this.elFrag, isRender);

	if (elseEl) {
		this.toggle(elseEl, this.elseElFrag, !isRender);
	}
}

/**
 * 切换节点内容渲染
 * @param  {Element}   renderEl
 * @param  {Fragment}  fragment
 * @param  {Boolean}   isRender
 */
vif.toggle = function (renderEl, fragment, isRender) {
	let vm = this.vm;
	let frag = fragment.cloneNode(true);

	// 渲染 & 更新视图
	if (isRender) {
		vm.compile(frag, true, this.scope, this.desc.once);
		renderEl.appendChild(frag);
	}
	// 不渲染的情况需要移除 DOM 索引的引用
	else {
		empty(renderEl);
		removeDOMRegister(vm, frag);
	}
}
