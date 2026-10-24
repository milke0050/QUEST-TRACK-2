# 화면 오른쪽 아래 구석에 사는 키보드 로봇 펫.
# 실행: .venv\Scripts\python.exe pet.py
import sys
from pathlib import Path

from pynput import keyboard
from PySide6.QtCore import QObject, Qt, QTimer, Signal
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import QApplication, QLabel, QMenu, QVBoxLayout, QWidget

# exe 로 묶으면 그림이 임시 폴더(sys._MEIPASS)에 풀린다.
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
ART = BASE / "art"

SIZE = 150    # 펫 그림이 들어갈 네모 크기 (px)
MARGIN = 16   # 화면 가장자리와 띄울 거리 (px)
REST_AFTER = 1_000    # 키를 이만큼 안 누르면 쉬기 (ms)
SLEEP_AFTER = 30_000  # 키를 이만큼 안 누르면 자기 (ms)


class KeyCounter(QObject):
    """키가 눌렸다는 사실만 알려 준다. 어떤 키인지는 받자마자 버리고 어디에도 남기지 않는다."""

    pressed = Signal()

    def __init__(self):
        super().__init__()
        # pynput 은 다른 줄(스레드)에서 돌아서, 신호로 펫 창에 알린다.
        self.listener = keyboard.Listener(on_press=lambda _key: self.pressed.emit())

    def start(self):
        self.listener.start()

    def stop(self):
        self.listener.stop()


class Pet(QWidget):
    def __init__(self):
        super().__init__()
        # 테두리 없음 · 항상 위 · 작업 표시줄에 안 나옴
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)

        self.poses = {
            name: QPixmap(str(ART / f"{name}.png")).scaled(
                SIZE, SIZE, Qt.KeepAspectRatio, Qt.SmoothTransformation
            )
            for name in ("rest", "type1", "type2", "sleep")
        }

        self.picture = QLabel(alignment=Qt.AlignCenter)
        self.picture.setFixedSize(SIZE, SIZE)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.picture)

        # 펫 아래 "오늘 N타" (프로그램을 끄면 0부터 다시)
        self.count = 0
        self.counter_label = QLabel(alignment=Qt.AlignCenter)
        self.counter_label.setFixedWidth(SIZE)
        self.counter_label.setStyleSheet(
            "color: white; background: rgba(30, 30, 40, 180);"
            "border-radius: 9px; padding: 2px 8px; font-size: 12px; font-weight: bold;"
        )
        layout.addWidget(self.counter_label)
        self.update_count_label()

        self.show_pose("rest")
        self.adjustSize()
        self.move_to_corner()

        self.drag_from = None
        self.next_typing_pose = "type1"

        # 마지막으로 누른 때부터 시간을 잰다. 키를 누를 때마다 처음부터 다시 잰다.
        self.rest_timer = self.make_timer(REST_AFTER, lambda: self.show_pose("rest"))
        self.sleep_timer = self.make_timer(SLEEP_AFTER, lambda: self.show_pose("sleep"))
        self.sleep_timer.start()  # 켜 놓고 30초 동안 안 치면 잔다

    def make_timer(self, ms, action):
        timer = QTimer(self, singleShot=True, interval=ms)
        timer.timeout.connect(action)
        return timer

    def show_pose(self, name):
        self.picture.setPixmap(self.poses[name])

    def on_key(self):
        # 누를 때마다 타자 ① ↔ ② 번갈아
        self.count += 1
        self.update_count_label()
        self.show_pose(self.next_typing_pose)
        self.next_typing_pose = "type2" if self.next_typing_pose == "type1" else "type1"
        self.rest_timer.start()
        self.sleep_timer.start()

    def update_count_label(self):
        self.counter_label.setText(f"오늘 {self.count:,}타")

    def move_to_corner(self):
        # availableGeometry 는 작업 표시줄을 뺀 화면이라, 작업 표시줄 바로 위에 놓인다.
        area = self.screen().availableGeometry()
        self.move(area.right() - self.width() - MARGIN, area.bottom() - self.height() - MARGIN)

    # 끌어서 옮기기
    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.drag_from = event.globalPosition().toPoint() - self.pos()

    def mouseMoveEvent(self, event):
        if self.drag_from is not None:
            self.move(event.globalPosition().toPoint() - self.drag_from)

    def mouseReleaseEvent(self, event):
        self.drag_from = None

    # 오른쪽 클릭 메뉴
    def contextMenuEvent(self, event):
        menu = QMenu(self)
        menu.addAction("끄기", QApplication.quit)
        menu.exec(event.globalPos())


if __name__ == "__main__":
    app = QApplication(sys.argv)
    pet = Pet()
    pet.show()
    keys = KeyCounter()
    keys.pressed.connect(pet.on_key)
    keys.start()
    code = app.exec()
    keys.stop()
    sys.exit(code)
