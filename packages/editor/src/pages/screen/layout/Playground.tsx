import {
	useKeyPress,
	useMount,
	useUnmount,
} from "ahooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDrop } from "react-dnd";
import { useCanvasStore } from "../hook";
import styles from "../styles/playground.module.css";
import Layer, { LayerAction } from "./Layer";
import Changer, { ChangerAction } from "./Changer";
import { message, Modal } from "antd";
import { smallId } from "@/common/util";
import { SyncData, syncHelper } from "@/common/syncHelper";
import { MojitoEvent } from "@/common/eventer";

const DefaulBackgroundColor = "#FFF";
const DefaultFontColor = "#000";

// 快捷键
const MoveKeys = ["UpArrow", "DownArrow", "LeftArrow", "RightArrow"];
const SelectLayerActionKeys = [
	"esc",
	"delete",
	"ctrl.h",
	"ctrl.l",
	"ctrl.g",
	"ctrl.b",
];
const CanvasActionKeys = ["ctrl.z", "ctrl.y", "ctrl.s", "ctrl.c", "ctrl.v"];

export default function Playground() {
	const { canvasStore } = useCanvasStore();
	const [modal, contextHolder] = Modal.useModal();
	// 相同组件的数量,主要为了新增图层时自动名称
	const layoutRef = useRef<HTMLDivElement | null>(null);
	const areaRef = useRef<HTMLDivElement | null>(null);
	const zoomRef = useRef<HTMLDivElement | null>(null);
	const changerRef = useRef<ChangerAction>();
	const [defaultLayerSize, setDefaultLayerSize] = useState({
		width: 300,
		height: 200,
	});
	const layerActionRefs = useRef<Map<string, LayerAction>>(new Map).current
	const { scale, screenInfo, layers } = canvasStore;
	const pageLayout = screenInfo ? screenInfo.style : undefined;

	/**
	 * 组件事件同步回调
	 */
	const syncCallback = useCallback((event: MojitoEvent<SyncData>) => {
		if(event.data){
			const { to, data } = event.data;
			to.forEach((key) => {
				layerActionRefs.get(key)?.eventSync(data);
			});
		}
	}, [layerActionRefs]);

	/**
	 * 页面构建完成
	 */
	useMount(() => {
		canvasStore.layoutContainer = layoutRef.current;
		canvasStore.areaElement = areaRef.current;
		canvasStore.zoomElement = zoomRef.current;
		canvasStore.zoomAuto();
		dropTarget(layoutRef);

		syncHelper.on("sync", syncCallback);
	});

	/**
	 * 退出编辑时保存数据
	 */
	useUnmount(() => {
		syncHelper.off("sync", syncCallback);
		canvasStore.saveScreen();
	});

	/**
	 * 根据页面大小设置默认图层大小
	 */
	useEffect(() => {
		if (pageLayout) {
			const width = Math.round(pageLayout.width * 0.2);
			const height = Math.round(width * (2 / 3));
			setDefaultLayerSize({ width, height });
			canvasStore.zoomTo(canvasStore.scale);
		}
	}, [pageLayout, canvasStore]);

	/**
	 * 接受拖入
	 */
	const [, dropTarget] = useDrop(
		() => ({
			accept: "ADD_COMPONENT",
			drop: (
				item: {
					exportName: string,
					name: string,
					scriptUrl: string,
					external: any,
					packId: string,
					packName:string,
					packVersion:string
				},
				monitor
			) => {
				const { name, scriptUrl, external, packId, packName, packVersion, exportName } = item;
				let x = 0;
				let y = 0;

				// 计算放下的位置
				const offset = monitor.getClientOffset();
				if (offset && layoutRef.current) {
					const dropTargetXy = layoutRef.current.getBoundingClientRect();
					x = (offset.x - dropTargetXy.left) / scale;
					y = (offset.y - dropTargetXy.top) / scale;
				}

				const z =
					canvasStore.layers && canvasStore.layers.length
						? canvasStore.layers[canvasStore.layers.length - 1].style.z + 1
						: 1;
				// 计算图层落下的位置
				x = Math.round(x - defaultLayerSize.width / 2);
				y = Math.round(y - defaultLayerSize.height / 2);
				// 新图层
				if (canvasStore && canvasStore.screenInfo) {
					const id = smallId();
					let newName = `图层${canvasStore.layers.length + 1}`;
					const isNameExist = canvasStore.layers.find(
						(lay) => lay.name === newName
					);
					if (isNameExist) {
						newName = `图层${id}`;
					}
					const newLayer: LayerInfo = {
						id,
						isFirst: true,
						name: newName,
						component: {
							exportName,
							name,
							packId,
						},
						eventLock: true,
						style: {
							x,
							y,
							z,
							width: defaultLayerSize.width,
							height: defaultLayerSize.height,
						},
					};

					canvasStore.addLayer(newLayer, {scriptUrl, external, name: packName, version: packVersion});
				}
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
				canDrop: monitor.canDrop(),
			}),
		}),
		[scale, defaultLayerSize]
	);

	/**
	 * 键盘移动图层
	 */
	useKeyPress(
		MoveKeys,
		(event) => {
			if (canvasStore.selectedLayers.size === 0 || !changerRef.current || document.activeElement !== document.body) return;
			event.preventDefault();
			let valueX = 0;
			let valueY = 0;
			switch (event.key) {
				case "ArrowUp":
					valueY = -1;
					break;
				case "ArrowDown":
					valueY = 1;
					break;
				case "ArrowLeft":
					valueX = -1;
					break;
				case "ArrowRight":
					valueX = 1;
					break;
			}
			changerRef.current.move(valueX, valueY);
		},
		{ useCapture: true, target: document.body }
	);

	/**
	 * 快捷键对图层的操作
	 */
	useKeyPress(
		SelectLayerActionKeys,
		(event) => {
			if (canvasStore.selectedLayers.size === 0 || document.activeElement !== document.body) return;
			
			event.preventDefault();
			switch (event.key) {
				case "Escape":
					// 取消选中
					canvasStore.cancelSelect();
					break;
				case "Delete":
					canvasStore.mouseDownEvent = undefined;
					modal.confirm({
						title: "确定删除?",
						onOk: () => {
							canvasStore.deleteLayer();
						},
						// onCancel: () => {},
					});
					break;
				case "g":
					// 群组选中的图层
					canvasStore.groupLayer();
					break;
				case "b":
					// 取消群组
					canvasStore.disbandGroup();
					break;
				case "l":
					// 锁定/解销图层
					canvasStore.lockLayer(!canvasStore.isAllLock);
					break;
				case "h":
					// 显示/隐藏图层
					canvasStore.hideLayer(!canvasStore.isAllHide);
					break;
			}
		},
		{ useCapture: true, exactMatch: true, target: document.body }
	);

	/**
	 * 撤销/重做/保存
	 */
	useKeyPress(
		CanvasActionKeys,
		(event) => {
			if(document.activeElement !== document.body) return;

			event.preventDefault();
			switch (event.key) {
				case "z":
					// 撤销
					canvasStore.undo();
					break;
				case "y":
					// 重做
					canvasStore.redo();
					break;
				case "s":
					// 保存
					canvasStore.saveScreen().then(() => {
						message.success("保存成功");
					});
					break;
				case "c":
					// 复制
					canvasStore.copy();
					break;
				case "v":
					// 粘贴
					canvasStore.paste();
					break;
			}
		},
		{ useCapture: true, exactMatch: true }
	);

	/**
	 * 取消所有选中
	 */
	// const clearAllSelected = useCallback(() => {
	// 	if (!actioning) canvasStore.cancelSelect();
	// }, [canvasStore, actioning]);

	/**
	 * 选中图层
	 */
	const onSelectLayer = useCallback(
		(
			layer: LayerInfo,
			event?: React.MouseEvent<HTMLDivElement, MouseEvent>
		) => {
			canvasStore.mouseDownEvent = event;
			canvasStore.selectLayer(layer, event && event.ctrlKey);
		},
		[canvasStore]
	);

	const onRef = useCallback((layerId:string, ref:LayerAction)=>{
		layerActionRefs.set(layerId, ref);
	}, [layerActionRefs])

	return (
		<div
			className={styles.playground}
			// onMouseDown={clearAllSelected}
		>
			<div className={styles.area} ref={areaRef}>
				<div ref={zoomRef} style={{ margin: "auto" }}>
					{pageLayout && (
						<div
							style={{
								...pageLayout,
								backgroundColor:
									pageLayout.backgroundColor || DefaulBackgroundColor,
								backgroundImage: pageLayout.backgroundImage
									? `url(${pageLayout.backgroundImage})`
									: "none",
								color: pageLayout.color || DefaultFontColor,
								backgroundSize:
									pageLayout.backgroundRepeat === "no-repeat"
										? "100% 100%"
										: undefined,
								backgroundRepeat: pageLayout.backgroundRepeat,
								position: "relative",
								boxShadow: "3px 3px 15px rgb(0 0 0 / 15%)",
								zIndex: 1,
							}}
							ref={layoutRef}
						>
							{layers &&
								layers.map((v) => {
									if (!v || !v.component) return null;
									return (
										<Layer
											enable
											defaultWidth={defaultLayerSize.width}
											defaultHeight={defaultLayerSize.height}
											data={v}
											key={v.id}
											onSelected={onSelectLayer}
											onRef={onRef}
										/>
									);
								})}
							<Changer changerActionRef={changerRef} />
						</div>
					)}
				</div>
			</div>
			{/* <ConnectedMenu /> */}
			{contextHolder}
		</div>
	);
}