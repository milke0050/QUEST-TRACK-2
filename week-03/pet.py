# 화면 오른쪽 아래 구석에 사는 키보드 로봇 펫.
# 실행: .venv\Scripts\python.exe pet.py
import sys
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import QApplication, QLabel, QMenu, QVBoxLayout, QWidget

# exe 로 묶으면 그림이 임시 폴더(sys._MEIPASS)에 풀린다.
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
ART = BASE / "art"

SIZE = 150    # 펫 그림이 들어갈 네모 크기 (px)
MARGIN = 16   # 화면 가장자리와 띄울 거리 (px)


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

        self.show_pose("rest")
        self.adjustSize()
        self.move_to_corner()

        self.drag_from = None

    def show_pose(self, name):
        self.picture.setPixmap(self.poses[name])

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
    sys.exit(app.exec())
