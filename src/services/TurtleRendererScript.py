"""
PrismTurtle — Command-recording turtle graphics engine.

Implements the standard Python turtle API, tracking position and heading
with pure math. Every drawing call is recorded to a command log that is
output as JSON for animated Canvas replay in the browser.

The user's turtle code is injected at the __USER_CODE__ marker below.
"""

import math
import json


class PrismTurtle:
    """Turtle graphics engine that records drawing commands for Canvas replay."""

    def __init__(self, width=800, height=600, background="black"):
        self._width = width
        self._height = height
        self._background = background

        self._x = width / 2.0
        self._y = height / 2.0
        self._angle = -90.0
        self._is_pen_down = True
        self._pen_color = (56, 189, 248)
        self._pen_width = 2
        self._fill_color = (56, 189, 248)
        self._is_filling = False
        self._fill_vertices = []
        self._is_visible = True

        self._command_log = []
        self._suppress_log_depth = 0

    # ── Command Recording Helpers ─────────────────────────────

    def _log(self, command):
        if self._suppress_log_depth == 0:
            self._command_log.append(command)

    def _color_to_css(self, color_value):
        """Convert an RGB tuple to a CSS hex string."""
        if isinstance(color_value, tuple) and len(color_value) >= 3:
            return f"#{color_value[0]:02x}{color_value[1]:02x}{color_value[2]:02x}"
        return str(color_value)

    def _resolve_color(self, color_value):
        """Convert various color formats to an RGB tuple."""
        if isinstance(color_value, tuple) and len(color_value) >= 3:
            return tuple(int(channel) for channel in color_value[:3])
        if isinstance(color_value, list) and len(color_value) >= 3:
            return tuple(int(channel) for channel in color_value[:3])
        if isinstance(color_value, str):
            color_value = color_value.strip()
            if color_value.startswith("#") and len(color_value) == 7:
                return (
                    int(color_value[1:3], 16),
                    int(color_value[3:5], 16),
                    int(color_value[5:7], 16),
                )
            if color_value.startswith("#") and len(color_value) == 4:
                return (
                    int(color_value[1] * 2, 16),
                    int(color_value[2] * 2, 16),
                    int(color_value[3] * 2, 16),
                )
            color_map = {
                "black": (0, 0, 0),
                "white": (255, 255, 255),
                "red": (255, 0, 0),
                "green": (0, 128, 0),
                "blue": (0, 0, 255),
                "cyan": (0, 255, 255),
                "magenta": (255, 0, 255),
                "yellow": (255, 255, 0),
                "orange": (255, 165, 0),
                "purple": (128, 0, 128),
                "pink": (255, 192, 203),
                "lime": (0, 255, 0),
                "navy": (0, 0, 128),
                "teal": (0, 128, 128),
                "maroon": (128, 0, 0),
                "olive": (128, 128, 0),
                "coral": (255, 127, 80),
                "salmon": (250, 128, 114),
                "gold": (255, 215, 0),
                "silver": (192, 192, 192),
                "gray": (128, 128, 128),
                "grey": (128, 128, 128),
                "aqua": (0, 255, 255),
                "violet": (238, 130, 238),
                "indigo": (75, 0, 130),
                "turquoise": (64, 224, 208),
                "crimson": (220, 20, 60),
                "chocolate": (210, 105, 30),
                "tomato": (255, 99, 71),
                "orchid": (218, 112, 214),
                "plum": (221, 160, 221),
                "tan": (210, 180, 140),
                "wheat": (245, 222, 179),
                "khaki": (240, 230, 140),
                "sienna": (160, 82, 45),
                "peru": (205, 133, 63),
                "linen": (250, 240, 230),
                "beige": (245, 245, 220),
                "ivory": (255, 255, 240),
                "snow": (255, 250, 250),
                "honeydew": (240, 255, 240),
                "lavender": (230, 230, 250),
                "skyblue": (135, 206, 235),
                "steelblue": (70, 130, 180),
                "royalblue": (65, 105, 225),
                "dodgerblue": (30, 144, 255),
                "deepskyblue": (0, 191, 255),
                "springgreen": (0, 255, 127),
                "limegreen": (50, 205, 50),
                "forestgreen": (34, 139, 34),
                "darkgreen": (0, 100, 0),
                "seagreen": (46, 139, 87),
                "darkred": (139, 0, 0),
                "firebrick": (178, 34, 34),
                "darkblue": (0, 0, 139),
                "midnightblue": (25, 25, 112),
                "darkorange": (255, 140, 0),
                "orangered": (255, 69, 0),
                "hotpink": (255, 105, 180),
                "deeppink": (255, 20, 147),
                "darkviolet": (148, 0, 211),
                "darkmagenta": (139, 0, 139),
                "slategray": (112, 128, 144),
                "darkslategray": (47, 79, 79),
                "dimgray": (105, 105, 105),
                "lightgray": (211, 211, 211),
                "lightgrey": (211, 211, 211),
                "darkgray": (169, 169, 169),
                "darkgrey": (169, 169, 169),
                "whitesmoke": (245, 245, 245),
                "gainsboro": (220, 220, 220),
            }
            normalized = color_value.lower().replace(" ", "")
            if normalized in color_map:
                return color_map[normalized]
            return (255, 255, 255)
        if isinstance(color_value, (int, float)):
            channel = max(0, min(255, int(color_value)))
            return (channel, channel, channel)
        return (255, 255, 255)

    # ── Movement ──────────────────────────────────────────────

    def forward(self, distance):
        radians = math.radians(self._angle)
        destination_x = self._x + math.cos(radians) * distance
        destination_y = self._y + math.sin(radians) * distance
        if self._is_filling:
            self._fill_vertices.append((destination_x, destination_y))
        self._x = destination_x
        self._y = destination_y
        self._log({"action": "forward", "value": str(distance)})
        return self

    def fd(self, distance):
        return self.forward(distance)

    def backward(self, distance):
        self._log({"action": "backward", "value": str(distance)})
        self._suppress_log_depth += 1
        self.forward(-distance)
        self._suppress_log_depth -= 1
        return self

    def bk(self, distance):
        return self.backward(distance)

    def back(self, distance):
        return self.backward(distance)

    def right(self, angle_degrees):
        self._angle += angle_degrees
        self._log({"action": "right", "value": str(angle_degrees)})
        return self

    def rt(self, angle_degrees):
        return self.right(angle_degrees)

    def left(self, angle_degrees):
        self._angle -= angle_degrees
        self._log({"action": "left", "value": str(angle_degrees)})
        return self

    def lt(self, angle_degrees):
        return self.left(angle_degrees)

    # ── Position ──────────────────────────────────────────────

    def goto(self, target_x, target_y=None):
        if target_y is None and hasattr(target_x, "__getitem__"):
            target_x, target_y = target_x[0], target_x[1]
        self._log({"action": "goto", "x": target_x, "y": target_y})
        canvas_x = self._width / 2.0 + target_x
        canvas_y = self._height / 2.0 - target_y
        if self._is_filling:
            self._fill_vertices.append((canvas_x, canvas_y))
        self._x = canvas_x
        self._y = canvas_y
        return self

    def setpos(self, target_x, target_y=None):
        return self.goto(target_x, target_y)

    def setposition(self, target_x, target_y=None):
        return self.goto(target_x, target_y)

    def setx(self, target_x):
        current_turtle_y = self.ycor()
        self._log({"action": "goto", "x": target_x, "y": current_turtle_y})
        canvas_x = self._width / 2.0 + target_x
        self._x = canvas_x
        return self

    def sety(self, target_y):
        current_turtle_x = self.xcor()
        self._log({"action": "goto", "x": current_turtle_x, "y": target_y})
        canvas_y = self._height / 2.0 - target_y
        self._y = canvas_y
        return self

    def setheading(self, heading_degrees):
        self._angle = heading_degrees - 90
        self._log({"action": "setheading", "value": str(heading_degrees)})
        return self

    def seth(self, heading_degrees):
        return self.setheading(heading_degrees)

    def home(self):
        self._x = self._width / 2.0
        self._y = self._height / 2.0
        self._angle = -90
        self._log({"action": "home"})
        return self

    # ── State Query ───────────────────────────────────────────

    def position(self):
        return (self._x - self._width / 2.0, self._height / 2.0 - self._y)

    def pos(self):
        return self.position()

    def xcor(self):
        return self._x - self._width / 2.0

    def ycor(self):
        return self._height / 2.0 - self._y

    def heading(self):
        return (self._angle + 90) % 360

    def isdown(self):
        return self._is_pen_down

    def towards(self, target_x, target_y=None):
        if target_y is None and hasattr(target_x, "__getitem__"):
            target_x, target_y = target_x[0], target_x[1]
        canvas_x = self._width / 2.0 + target_x
        canvas_y = self._height / 2.0 - target_y
        delta_x = canvas_x - self._x
        delta_y = -(canvas_y - self._y)
        return math.degrees(math.atan2(delta_y, delta_x)) % 360

    def distance(self, target_x, target_y=None):
        if target_y is None and hasattr(target_x, "__getitem__"):
            target_x, target_y = target_x[0], target_x[1]
        canvas_x = self._width / 2.0 + target_x
        canvas_y = self._height / 2.0 - target_y
        return math.sqrt((canvas_x - self._x) ** 2 + (canvas_y - self._y) ** 2)

    # ── Pen Control ───────────────────────────────────────────

    def penup(self):
        self._is_pen_down = False
        self._log({"action": "penup"})
        return self

    def pu(self):
        return self.penup()

    def up(self):
        return self.penup()

    def pendown(self):
        self._is_pen_down = True
        self._log({"action": "pendown"})
        return self

    def pd(self):
        return self.pendown()

    def down(self):
        return self.pendown()

    def pensize(self, width=None):
        if width is None:
            return self._pen_width
        self._pen_width = max(1, int(width))
        self._log({"action": "width", "value": str(self._pen_width)})
        return self

    def width(self, width=None):
        return self.pensize(width)

    def pencolor(self, *args):
        if not args:
            return self._pen_color
        if len(args) == 1:
            self._pen_color = self._resolve_color(args[0])
        elif len(args) == 3:
            self._pen_color = (int(args[0]), int(args[1]), int(args[2]))
        self._log({"action": "color", "value": self._color_to_css(self._pen_color)})
        return self

    def color(self, *args):
        if not args:
            return self._pen_color
        if len(args) == 1:
            resolved = self._resolve_color(args[0])
            self._pen_color = resolved
            self._fill_color = resolved
        elif len(args) == 2:
            self._pen_color = self._resolve_color(args[0])
            self._fill_color = self._resolve_color(args[1])
        elif len(args) == 3:
            color_tuple = (int(args[0]), int(args[1]), int(args[2]))
            self._pen_color = color_tuple
            self._fill_color = color_tuple
        self._log({"action": "color", "value": self._color_to_css(self._pen_color)})
        return self

    # ── Fill ──────────────────────────────────────────────────

    def fillcolor(self, *args):
        if not args:
            return self._fill_color
        if len(args) == 1:
            self._fill_color = self._resolve_color(args[0])
        elif len(args) == 3:
            self._fill_color = (int(args[0]), int(args[1]), int(args[2]))
        self._log({"action": "fillcolor", "value": self._color_to_css(self._fill_color)})
        return self

    def begin_fill(self):
        self._is_filling = True
        self._fill_vertices = [(self._x, self._y)]
        self._log({"action": "begin_fill"})
        return self

    def end_fill(self):
        self._is_filling = False
        self._fill_vertices = []
        self._log({"action": "end_fill"})
        return self

    def filling(self):
        return self._is_filling

    # ── Drawing Primitives ────────────────────────────────────

    def circle(self, radius, extent=360, steps=None):
        if extent == 360:
            self._log({"action": "circle", "value": str(radius)})
        else:
            self._log({"action": "arc", "value": str(radius), "value2": str(extent)})
        self._suppress_log_depth += 1
        if steps is None:
            steps = max(12, int(abs(radius) * abs(extent) / 360 * 36))
        step_angle = extent / steps
        step_length = 2 * abs(radius) * math.sin(math.radians(abs(step_angle) / 2))
        if radius < 0:
            step_angle = -step_angle
        for _ in range(steps):
            self.forward(step_length)
            self.left(step_angle) if radius >= 0 else self.right(-step_angle)
        self._suppress_log_depth -= 1
        return self

    def dot(self, size=None, color=None):
        dot_color = self._resolve_color(color) if color else self._pen_color
        effective_size = size or max(self._pen_width + 4, 2 * self._pen_width)
        log_entry = {"action": "dot", "value": str(effective_size)}
        if color:
            log_entry["color"] = self._color_to_css(dot_color)
        self._log(log_entry)
        return self

    def stamp(self):
        self._log({"action": "stamp"})
        self._suppress_log_depth += 1
        self.dot(max(self._pen_width + 4, 8))
        self._suppress_log_depth -= 1
        return self

    def write(self, text, move=False, align="left", font=None):
        text = str(text)
        log_entry = {"action": "write", "text": text, "value": text}
        if font and len(font) >= 2:
            log_entry["fontSize"] = font[1]
        self._log(log_entry)
        return self

    # ── Canvas Control ────────────────────────────────────────

    def clear(self):
        self._log({"action": "clear"})
        return self

    def reset(self):
        self.clear()
        self._x = self._width / 2.0
        self._y = self._height / 2.0
        self._angle = -90
        self._is_pen_down = True
        self._pen_color = (56, 189, 248)
        self._pen_width = 2
        self._fill_color = (56, 189, 248)
        self._is_filling = False
        self._fill_vertices = []
        self._command_log = []
        self._log({"action": "reset"})
        return self

    def bgcolor(self, color_value=None):
        if color_value is None:
            return self._background
        self._background = self._resolve_color(color_value)
        return self

    # ── Visibility ────────────────────────────────────────────

    def hideturtle(self):
        self._is_visible = False
        self._log({"action": "hideturtle"})
        return self

    def ht(self):
        return self.hideturtle()

    def showturtle(self):
        self._is_visible = True
        self._log({"action": "showturtle"})
        return self

    def st(self):
        return self.showturtle()

    def isvisible(self):
        return self._is_visible

    def speed(self, speed_value=None):
        if speed_value is not None:
            self._log({"action": "speed", "value": str(speed_value)})
        return self

    def tracer(self, n=None, delay=None):
        return self

    def update(self):
        return self

    # ── Output ────────────────────────────────────────────────

    def save(self, output_path=None):
        """Output recorded commands as JSON for animated Canvas rendering."""
        background_css = self._background
        if isinstance(self._background, tuple):
            background_css = self._color_to_css(self._background)

        output = {
            "commands": self._command_log,
            "canvasWidth": self._width,
            "canvasHeight": self._height,
            "background": background_css,
        }
        print("__PRISM_TURTLE_DATA_START__")
        print(json.dumps(output, separators=(",", ":")))
        print("__PRISM_TURTLE_DATA_END__")
        return self

    def get_image(self):
        return None

    def get_draw(self):
        return None


# ── Multiple turtle support ──────────────────────────────────

_default_turtle = None
_canvas_width = 800
_canvas_height = 600
_canvas_background = "black"


def _get_default():
    global _default_turtle
    if _default_turtle is None:
        _default_turtle = PrismTurtle(_canvas_width, _canvas_height, _canvas_background)
    return _default_turtle


def setup(width=800, height=600):
    global _canvas_width, _canvas_height, _default_turtle
    _canvas_width = width
    _canvas_height = height
    _default_turtle = PrismTurtle(width, height, _canvas_background)


# Functional API — proxies to the default turtle
def forward(distance): return _get_default().forward(distance)
def fd(distance): return _get_default().fd(distance)
def backward(distance): return _get_default().backward(distance)
def bk(distance): return _get_default().bk(distance)
def back(distance): return _get_default().back(distance)
def right(angle): return _get_default().right(angle)
def rt(angle): return _get_default().rt(angle)
def left(angle): return _get_default().left(angle)
def lt(angle): return _get_default().lt(angle)
def goto(target_x, target_y=None): return _get_default().goto(target_x, target_y)
def setpos(target_x, target_y=None): return _get_default().setpos(target_x, target_y)
def setposition(target_x, target_y=None): return _get_default().setposition(target_x, target_y)
def setx(target_x): return _get_default().setx(target_x)
def sety(target_y): return _get_default().sety(target_y)
def setheading(angle): return _get_default().setheading(angle)
def seth(angle): return _get_default().seth(angle)
def home(): return _get_default().home()
def position(): return _get_default().position()
def pos(): return _get_default().pos()
def xcor(): return _get_default().xcor()
def ycor(): return _get_default().ycor()
def heading(): return _get_default().heading()
def isdown(): return _get_default().isdown()
def towards(target_x, target_y=None): return _get_default().towards(target_x, target_y)
def distance(target_x, target_y=None): return _get_default().distance(target_x, target_y)
def penup(): return _get_default().penup()
def pu(): return _get_default().pu()
def up(): return _get_default().up()
def pendown(): return _get_default().pendown()
def pd(): return _get_default().pd()
def down(): return _get_default().down()
def pensize(width=None): return _get_default().pensize(width)
def width(width=None): return _get_default().width(width)
def pencolor(*args): return _get_default().pencolor(*args)
def color(*args): return _get_default().color(*args)
def fillcolor(*args): return _get_default().fillcolor(*args)
def begin_fill(): return _get_default().begin_fill()
def end_fill(): return _get_default().end_fill()
def filling(): return _get_default().filling()
def circle(radius, extent=360, steps=None): return _get_default().circle(radius, extent, steps)
def dot(size=None, color_value=None): return _get_default().dot(size, color_value)
def stamp(): return _get_default().stamp()
def write(text, move=False, align="left", font=None): return _get_default().write(text, move, align, font)
def clear(): return _get_default().clear()
def reset(): return _get_default().reset()
def bgcolor(color_value=None): return _get_default().bgcolor(color_value)
def hideturtle(): return _get_default().hideturtle()
def ht(): return _get_default().ht()
def showturtle(): return _get_default().showturtle()
def st(): return _get_default().st()
def isvisible(): return _get_default().isvisible()
def speed(speed_value=None): return _get_default().speed(speed_value)
def tracer(n=None, delay=None): return _get_default().tracer(n, delay)
def update(): return _get_default().update()
def save(path=None): return _get_default().save(path)
def get_image(): return _get_default().get_image()
def get_draw(): return _get_default().get_draw()


# ── Execute user code ─────────────────────────────────────────
# __USER_CODE_MARKER__
