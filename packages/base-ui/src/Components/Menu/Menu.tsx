import { Component, ComponentChild, createRef } from 'preact';
import { Subscription } from 'rxjs';
import { ICommandService, isRealNum } from '@univerjs/core';
import { BaseMenuProps, BaseMenuState, BaseMenuItem, BaseMenuStyle } from '../../Interfaces';
import { joinClassNames } from '../../Utils';
import { CustomLabel } from '../CustomLabel';

import styles from './index.module.less';
import { AppContext } from '../../Common/AppContext';
import { ICustomComponentOption, IDisplayMenuItem, IMenuItem, IValueOption, isValueOptions } from '../../services/menu/menu';
import { BaseMenuItem, BaseMenuProps, BaseMenuStyle } from '../../Interfaces/Menu';
import { joinClassNames } from '../../Utils/util';
import { CustomLabel, NeoCustomLabel } from '../CustomLabel/CustomLabel';
import { IMenuService } from '../../services/menu/menu.service';

export interface IBaseMenuState {
    show: boolean;
    posStyle: BaseMenuStyle;
    menuItems: Array<IDisplayMenuItem<IMenuItem>>;
}

export class Menu extends Component<BaseMenuProps, IBaseMenuState> {
    static override contextType = AppContext;

    private _MenuRef = createRef<HTMLUListElement>();

    private _refs: Menu[] = [];

    constructor(props: BaseMenuProps) {
        super(props);
        this.initialize();
    }

    override componentDidMount(): void {
        this.getSubMenus();
    }

    override componentWillReceiveProps(nextProps: Readonly<BaseMenuProps>): void {
        if (this.props.menuId !== nextProps.menuId) {
            this.getSubMenus();
        }
    }

    getMenuRef = () => this._MenuRef;

    handleClick = (e: MouseEvent, item: BaseMenuItem, index: number) => {
        const { deep = 0 } = this.props;

        item.onClick?.call(null, e, item.value, index, deep);
        this.props.onClick?.call(null, e, item.value, index, deep);
        this.showMenu(false);
    };

    showMenu = (show: boolean) => {
        this.setState(
            (prevState) => ({ show }),
            () => {
                this.getStyle();
            }
        );
    };

    mouseEnter = (e: MouseEvent, index: number) => {
        const { menu = [] } = this.props;
        if (menu[index].children) {
            this._refs[index].showMenu(true);
        }
    };

    mouseLeave = (e: MouseEvent, index: number) => {
        const { menu = [] } = this.props;
        if (menu[index].children) {
            this._refs[index].showMenu(false);
        }
    };

    getStyle = () => {
        const current = this._MenuRef.current;
        if (!current) return;
        const style: BaseMenuStyle = {};
        const curPosition = current.getBoundingClientRect();
        let docPosition;
        const { dom, parent } = this.props;
        if (dom) {
            docPosition = dom.getBoundingClientRect();
        } else {
            docPosition = {
                left: 0,
                right: document.documentElement.clientWidth,
                top: 0,
                bottom: document.documentElement.clientHeight,
            };
        }

        // 处理li中包含的ul右边界
        if (parent) {
            current.style.position = 'fixed';
            // 获取固定定位后 父元素正确的位置信息
            const parPosition = current.parentElement?.getBoundingClientRect();
            if (!parPosition) return;
            if (parPosition.right + curPosition.width > docPosition.right) {
                style.left = `${parPosition.left - curPosition.width}px`;
                style.top = `${parPosition.top}px`;
            } else {
                style.left = `${parPosition.right}px`;
                style.top = `${parPosition.top}px`;
            }
            if (curPosition.bottom > docPosition.bottom) {
                style.top = 'auto';
                style.bottom = `5px`;
            }
            this.setState({
                posStyle: style,
            });
        }
    };

    // eslint-disable-next-line max-lines-per-function
    render() {
        const { context, props, state } = this;
        const { className = '', style = '', menu, deep = 0, options, display } = props;
        const { posStyle, show, menuItems } = state;

        return (
            <ul className={joinClassNames(styles.colsMenu, className)} style={{ ...style, ...posStyle, display: show ? 'block' : 'none' }} ref={this._MenuRef}>
                {/* legacy: render selections */}
                {menu?.map((item: BaseMenuItem, index: number) => {
                    if (item.show === false) return;
                    // TODO@wzhudev: missing a mechanism to highlight currently selected option via value.
                    return (
                        <>
                            <li
                                className={joinClassNames(styles.colsMenuitem, item.className ?? '', item.disabled ? styles.colsMenuitemDisabled : '')}
                                style={item.style ?? ''}
                                onClick={(e) => this.handleClick(e, item, index)}
                                onMouseEnter={(e) => {
                                    this.mouseEnter(e, index);
                                }}
                                onMouseLeave={(e) => {
                                    this.mouseLeave(e, index);
                                }}
                            >
                                <CustomLabel label={item.label} />
                                {/* TODO: if the menu itself contains a submenu. It should be served as an `IMenuItem` not wrapped options. */}
                                {item.children ? (
                                    <Menu
                                        ref={(ele: Menu) => (this._refs[index] = ele)}
                                        menu={item.children}
                                        onClick={item.onClick}
                                        className={item.className}
                                        style={item.style}
                                        parent={this}
                                        deep={deep + 1}
                                    ></Menu>
                                ) : (
                                    <></>
                                )}
                            </li>
                            {item.border ? <div className={styles.colsMenuitemLine}></div> : ''}
                        </>
                    );
                })}
                {options?.map((option: IValueOption | ICustomComponentOption, index: number) => {
                    // render value option
                    const isValueOption = isValueOptions(option);
                    if (isValueOption) {
                        return (
                            <li
                                className={joinClassNames(styles.colsMenuitem, option.disabled ? styles.colsMenuitemDisabled : '')}
                                onClick={() => {
                                    if (option.value) {
                                        this.props.onOptionSelect!(option);
                                    }
                                    // TODO: handle if options is a custom component
                                }}
                            >
                                <NeoCustomLabel value={option.value} display={display} title={option.label} />
                            </li>
                        );
                    }

                    // custom component option
                    const CustomComponent = context.componentManager?.get(option.id);
                    return (
                        <li>
                            <CustomComponent
                                onValueChange={(v: string | number) => {
                                    this.props.onOptionSelect!({ value: v, label: option.id });
                                    this.showMenu(false);
                                }}
                            />
                        </li>
                    );
                })}
                {/* render submenus */}
                {menuItems?.map((item, index) => (
                    <MenuItem menuItem={item} index={index} onClick={() => this.showMenu(false)} />
                ))}
            </ul>
        );
    }

    protected initialize() {
        this.state = {
            show: false,
            posStyle: {},
            menuItems: [],
        };
    }

    private getSubMenus() {
        const { menuId } = this.props;
        if (menuId) {
            const menuService: IMenuService = this.context.injector.get(IMenuService);
            this.setState({
                menuItems: menuService.getSubMenuItems(menuId),
            });
        }
    }
}

export interface IMenuItemProps {
    menuItem: IDisplayMenuItem<IMenuItem>;
    index: number;
    onClick: () => void;
}

export class MenuItem extends Component<IMenuItemProps, { disabled: boolean }> {
    static override contextType = AppContext;

    private disabledSubscription: Subscription | undefined;

    private _refs: Menu[] = [];

    constructor() {
        super();

        this.state = {
            disabled: false,
            value: {},
        };
    }

    mouseEnter = (e: MouseEvent, index: number) => {
        const { menuItem } = this.props;
        if (menuItem.subMenus) {
            this._refs[index].showMenu(true);
        }
    };

    mouseLeave = (e: MouseEvent, index: number) => {
        const { menuItem } = this.props;
        if (menuItem.subMenus) {
            this._refs[index].showMenu(false);
        }
    };

    override componentDidMount(): void {
        this.disabledSubscription = this.props.menuItem.disabled$?.subscribe((disabled) => {
            this.setState({ disabled });
        });
    }

    override componentWillUnmount(): void {
        this.disabledSubscription?.unsubscribe();
    }

    handleClick = (e: MouseEvent, item: IDisplayMenuItem, index: number) => {
        // item.onClick?.call(null, e, item.value, index, deep);
        const commandService: ICommandService = this.context.injector.get(ICommandService);
        this.props.onClick();

        const value = this.state.value;
        !(item.subMenuItems && item.subMenuItems.length > 0) && commandService.executeCommand(item.id, { value });
        // this.showMenu(false);
    };

    /**
     * user input change value from CustomLabel
     * @param e
     */
    onChange = (e: Event) => {
        const targetValue = (e.target as HTMLInputElement).value;
        const value = isRealNum(targetValue) ? parseInt(targetValue) : targetValue;

        this.setState({
            value,
        });
    };

    override render(): ComponentChild {
        const { menuItem: item, index } = this.props;
        // const commandService: ICommandService = this.context.injector.get(ICommandService);
        const { disabled } = this.state;

        return (
            <li
                className={joinClassNames(styles.colsMenuitem, disabled ? styles.colsMenuitemDisabled : '')}
                // onClick={() => {
                //     this.props.onClick();
                //     commandService.executeCommand(item.id);
                // }}
                onClick={(e) => this.handleClick(e, item, index)}
                onMouseEnter={(e) => {
                    this.mouseEnter(e, index);
                }}
                onMouseLeave={(e) => {
                    this.mouseLeave(e, index);
                }}
            >
                <CustomLabel label={item.label || item.title} onChange={this.onChange}></CustomLabel>
                {item.shortcut && ` (${item.shortcut})`}
                {item.subMenuItems && item.subMenuItems.length > 0 ? (
                    <Menu ref={(ele: Menu) => (this._refs[index] = ele)} menuItems={item.subMenuItems} parent={this}></Menu>
                ) : (
                    <></>
                )}
            </li>
        );
    }
}
