import eventer from '../eventer';
import { empty, hasAttr, getAttr, setAttr, addClass, isElement, removeAttr, removeClass } from '../dom';
import { warn, each, hasOwn, isBool, isArray, isNumber, removeSpace, getKeyValue, stringToFragment } from '../util';

const renderContent = '__render';
const visibleDisplay = '__visible';

/**
 * 移除 DOM 注册的引用
 * @param   {Object}      vm
 * @param   {DOMElement}  element
 */
function removeDOMRegister (vm, element) {
	var registers = vm.$data.$els;
	var childNodes = element.childNodes;

	for (let i = 0; i < childNodes.length; i++) {
		let node = childNodes[i];

		if (!isElement(node)) {
			continue;
		}

		let nodeAttrs = node.attributes;

		for (let ii = 0; ii < nodeAttrs.length; ii++) {
			let attr = nodeAttrs[ii];
			if (attr.name === 'v-el' && hasOwn(registers, attr.value)) {
				registers[attr.value] = null;
			}
		}

		if (node.hasChildNodes()) {
			removeDOMRegister(vm, node);
		}
	}
}

/**
 * 添加/移除 class, 支持空格分隔
 * @param  {DOMElement}  node
 * @param  {String}      classname
 * @param  {Boolean}     remove
 */
function handleClass (node, classname, remove) {
	each(classname.split(' '), function (cls) {
		if (remove) {
			removeClass(node, cls);
		} else {
			addClass(node, cls);
		}
	});
}

/**
 * 获取节点的下一个兄弟元素节点
 */
function getNextSiblingElement (node) {
	var el = node.nextSibling;

	if (el && isElement(el)) {
		return el;
	}

	while (el) {
		el = el.nextSibling;

		if (el && isElement(el)) {
			return el;
		}
	}

	return null;
}

/**
 * 缓存节点行内样式值
 * 行内样式 display='' 不会影响由 classname 中的定义
 * visibleDisplay 用于缓存节点行内样式的 display 显示值
 * @param  {DOMElement}  node
 */
function setVisibleDisplay (node) {
	if (!node[visibleDisplay]) {
		let display;
		let inlineStyle = removeSpace(getAttr(node, 'style'));

		if (inlineStyle && inlineStyle.indexOf('display') > -1) {
			let styles = inlineStyle.split(';');

			each(styles, function (style) {
				if (style.indexOf('display') > -1) {
					display = getKeyValue(style);
				}
			});
		}

		if (display !== 'none') {
			node[visibleDisplay] = display || '';
		}
	}
}

/**
 * 缓存节点渲染内容并清空
 */
function setRenderContent (node) {
	if (!node[renderContent]) {
		node[renderContent] = node.innerHTML;
	}
	empty(node);
}


/**
 * updater 视图刷新模块
 */
function Updater (vm) {
	this.vm = vm;
}

var up = Updater.prototype;

/**
 * 更新节点的文本内容 realize v-text
 * @param   {DOMElement}  node
 * @param   {String}      text
 */
up.updateTextContent = function (node, text) {
	node.textContent = String(text);
}

/**
 * 更新节点的 html 内容 realize v-html
 * 处理 {{{html}}} 指令时 node 为文本的父节点
 * @param   {DOMElement}  node
 * @param   {String}      html
 */
up.updateHtmlContent = function (node, html) {
	empty(node).appendChild(stringToFragment(String(html)));
}

/**
 * 更新节点的显示隐藏 realize v-show/v-else
 * @param   {DOMElement}  node
 * @param   {Boolean}     show    [是否显示]
 */
up.updateDisplay = function (node, show) {
	var siblingNode = getNextSiblingElement(node);

	setVisibleDisplay(node);
	this.updateStyle(node, 'display', show ? node[visibleDisplay] : 'none');

	// v-else
	if (siblingNode && (hasAttr(siblingNode, 'v-else') || siblingNode.__directive === 'v-else')) {
		setVisibleDisplay(siblingNode);
		this.updateStyle(siblingNode, 'display', show ? 'none' : siblingNode[visibleDisplay]);
	}
}

/**
 * 更新节点内容的渲染 realize v-if/v-else
 * @param   {DOMElement}  node
 * @param   {Boolean}     isRender  [是否渲染]
 */
up.updateRenderContent = function (node, isRender) {
	var siblingNode = getNextSiblingElement(node);

	setRenderContent(node);
	this.toggleRender.apply(this, arguments);

	// v-else
	if (siblingNode && (hasAttr(siblingNode, 'v-else') || siblingNode.__directive === 'v-else')) {
		setRenderContent(siblingNode);
		this.toggleRender(siblingNode, !isRender);
	}
}

/**
 * 切换节点内容渲染
 */
up.toggleRender = function (node, isRender) {
	var vm = this.vm;
	var fragment = stringToFragment(node[renderContent]);

	// 渲染
	if (isRender) {
		vm.complieElement(fragment, true);
		node.appendChild(fragment);
	}
	// 不渲染的情况需要移除 DOM 注册的引用
	else {
		removeDOMRegister(vm, fragment);
	}
}

/**
 * 更新节点的 attribute realize v-bind
 * @param   {DOMElement}  node
 * @param   {String}      attribute
 * @param   {String}      value
 */
up.updateAttribute = function (node, attribute, value) {
	// null 则移除该属性
	if (value === null) {
		removeAttr.apply(this, arguments);
	}
	// setAttribute 不适合用于 value
	// https://developer.mozilla.org/en-US/docs/Web/API/Element/setAttribute
	else if (attribute === 'value') {
		node.value = value;
	}
	else {
		setAttr(node, attribute, value);
	}
}

/**
 * 更新节点的 classname realize v-bind:class
 * @param   {DOMElement}          node
 * @param   {String|Boolean}      newclass
 * @param   {String|Boolean}      oldclass
 * @param   {String}              classname
 */
up.updateClassName = function (node, newclass, oldclass, classname) {
	// 指定 classname 变化值由 newclass 布尔值决定
	if (classname) {
		if (newclass === true) {
			handleClass(node, classname);
		} else if (newclass === false) {
			handleClass(node, classname, true);
		}
	}
	// 未指定 classname 变化值由 newclass 的值决定
	else {
		if (newclass) {
			handleClass(node, newclass);
		}

		if (oldclass) {
			handleClass(node, oldclass, true);
		}
	}
}

/**
 * 更新节点的 style realize v-bind:style
 * @param   {DOMElement}  node
 * @param   {String}      property  [属性名称]
 * @param   {String}      value     [样式值]
 */
up.updateStyle = function (node, property, value) {
	if (node.style[property] !== value) {
		node.style[property] = value;
	}
}

/**
 * 更新节点绑定事件的回调函数 realize v-on
 * @param   {DOMElement}   node
 * @param   {String}       evt
 * @param   {Function}     callback
 * @param   {Boolean}      capture
 * @param   {Boolean}      unbind
 */
up.updateEvent = function (node, evt, callback, capture, unbind) {
	// 移除绑定
	if (unbind) {
		eventer.remove(node, evt, callback, capture);
	} else {
		eventer.add(node, evt, callback, capture);
	}
}

/**
 * 更新 text 或 textarea 的 value realize v-model
 * @param   {Input}  text
 * @param   {String} value
 */
up.updateTextValue = function (text, value) {
	if (text.value !== value) {
		text.value = value;
	}
}

/**
 * 更新 radio 的激活状态 realize v-model
 * @param   {Input}  radio
 * @param   {String} value
 */
up.updateRadioChecked = function (radio, value) {
	radio.checked = radio.value === (isNumber(value) ? String(value) : value);
}

/**
 * 更新 checkbox 的激活状态 realize v-model
 * @param   {Input}          checkbox
 * @param   {Array|Boolean}  values      [激活数组或状态]
 */
up.updateCheckboxChecked = function (checkbox, values) {
	var value = checkbox.value;

	if (!isArray(values) && !isBool(values)) {
		return warn('Checkbox v-model value must be a type of Boolean or Array');
	}

	if (hasAttr(checkbox, 'number')) {
		value = +value;
	}

	checkbox.checked = isBool(values) ? values : (values.indexOf(value) > -1);
}

/**
 * 更新 select 的激活状态 realize v-model
 * @param   {Select}         select
 * @param   {Array|String}   selected  [选中值]
 * @param   {Boolean}        multi
 */
up.updateSelectChecked = function (select, selected, multi) {
	var getNumber = hasAttr(select, 'number');
	var options = select.options, leng = options.length;
	var multiple = multi || hasAttr(select, 'multiple');

	for (var i = 0; i < leng; i++) {
		let option = options[i];
		let value = option.value;
		value = getNumber ? +value : (hasAttr(option, 'number') ? +value : value);
		option.selected = multiple ? selected.indexOf(value) > -1 : selected === value;
	}
}

export default Updater;
